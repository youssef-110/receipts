// SSRF guard: public http(s) hosts on ports 80/443 only.
import { promises as dns } from "node:dns";
import { isIP } from "node:net";

function v4Private(p: number[]): boolean {
  const [a, b] = p;
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) || // 192.0.0.0/24 IETF, 192.0.2.0/24 TEST-NET-1
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmarking
    (a === 198 && b === 51 && p[2] === 100) || // TEST-NET-2
    (a === 203 && b === 0 && p[2] === 113) || // TEST-NET-3
    a >= 224 // multicast/reserved
  );
}

const v4FromGroups = (hi: number, lo: number): number[] => [hi >> 8, hi & 255, lo >> 8, lo & 255];

/** Expand an IPv6 string into 8 16-bit groups. */
function v6Groups(ip: string): number[] {
  let s = ip.split("%")[0].toLowerCase();
  const m = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/); // trailing dotted quad
  if (m) {
    const q = m[2].split(".").map(Number);
    s = m[1] + ((q[0] << 8) | q[1]).toString(16) + ":" + ((q[2] << 8) | q[3]).toString(16);
  }
  const [head, tail] = s.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail === undefined ? [] : Array(8 - h.length - t.length).fill("0");
  return [...h, ...fill, ...t].map((x) => parseInt(x || "0", 16));
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return v4Private(ip.split(".").map(Number));
  if (v !== 6) return true; // unparseable = unsafe
  const g = v6Groups(ip);
  if (g.every((x) => x === 0) || (g.slice(0, 7).every((x) => x === 0) && g[7] === 1)) return true; // :: and ::1
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  // IPv4-mapped ::ffff:a.b.c.d, IPv4-compatible ::a.b.c.d, NAT64 64:ff9b::/96
  const embedded =
    (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) ||
    g.slice(0, 6).every((x) => x === 0) ||
    (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0));
  if (embedded) return v4Private(v4FromGroups(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48 local NAT64
  if (g[0] === 0x2002) return v4Private(v4FromGroups(g[1], g[2])); // 6to4 embeds IPv4 in groups 1-2
  if (g[0] === 0x2001 && g[1] === 0) return v4Private(v4FromGroups(g[6] ^ 0xffff, g[7] ^ 0xffff)); // Teredo: inverted client IPv4
  if ((g[0] & 0xe000) !== 0x2000) return true; // only global unicast 2000::/3 is public
  return false;
}

export class BlockedUrlError extends Error {}

// shortcut: DNS rebinding between this lookup and the socket connect is not pinned, upgrade by connecting to the vetted IP via a custom undici dispatcher.
export async function assertPublicUrl(url: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new BlockedUrlError(`invalid URL: ${url}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError(`blocked protocol ${u.protocol}`);
  if (u.username || u.password) throw new BlockedUrlError("credentials in URL not allowed");
  const port = u.port || (u.protocol === "https:" ? "443" : "80");
  if (port !== "80" && port !== "443") throw new BlockedUrlError(`blocked port ${port}`);
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) throw new BlockedUrlError(`blocked private address ${host}`);
    return u;
  }
  let addrs: { address: string }[];
  try {
    addrs = await dns.lookup(host, { all: true });
  } catch (e) {
    throw new BlockedUrlError(`DNS lookup failed for ${host}: ${e instanceof Error ? e.message : e}`);
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateIp(a.address))) throw new BlockedUrlError(`blocked non-public host ${host}`);
  return u;
}
