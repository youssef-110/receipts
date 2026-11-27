import { politeFetch } from "../net/politeFetch";
import type { Collector, Evidence, FetchResult, RunCtx } from "../types";

interface DnsAnswer {
  Answer?: { type: number; data: string }[];
}

// substring of lowercased TXT data -> service name
const TXT_SERVICES: [string, string][] = [
  ["_spf.google.com", "Google Workspace"],
  ["google-site-verification", "Google Workspace"],
  ["spf.protection.outlook.com", "Microsoft 365"],
  ["ms=ms", "Microsoft 365"],
  ["salesforce", "Salesforce"],
  ["exacttarget", "Salesforce"],
  ["pardot", "Salesforce"],
  ["hubspot", "HubSpot"],
  ["zendesk", "Zendesk"],
  ["atlassian", "Atlassian"],
  ["mailchimp", "Mailchimp"],
  ["mandrillapp", "Mailchimp"],
  ["sendgrid", "SendGrid"],
  ["amazonses", "Amazon SES"],
  ["pphosted", "Proofpoint"],
  ["proofpoint", "Proofpoint"],
  ["mimecast", "Mimecast"],
  ["facebook-domain-verification", "Meta"],
  ["stripe-verification", "Stripe"],
  ["docusign", "DocuSign"],
  ["zoom", "Zoom"],
];

const MX_PROVIDERS: [string, string][] = [
  ["google.com", "Google Workspace"],
  ["googlemail.com", "Google Workspace"],
  ["outlook.com", "Microsoft 365"],
  ["pphosted.com", "Proofpoint"],
  ["mimecast", "Mimecast"],
  ["protonmail", "Proton"],
  ["zoho", "Zoho"],
  ["messagingengine", "Fastmail"],
];

function parse(r: FetchResult): DnsAnswer | null {
  if (!r.ok) return null;
  try {
    return JSON.parse(r.text) as DnsAnswer;
  } catch {
    return null;
  }
}

export const dnsCollector: Collector = {
  name: "dns",
  modes: ["vendor", "shop"],
  timeoutMs: 6000,
  async run(ctx: RunCtx): Promise<Evidence[]> {
    const { registrableDomain: d, isPlatformHost } = ctx.site;
    if (isPlatformHost) return [];
    const q = (type: string) => `https://dns.google/resolve?name=${encodeURIComponent(d)}&type=${type}`;
    const [txt, mx] = await Promise.all([
      politeFetch(q("TXT"), { timeoutMs: 5500 }),
      politeFetch(q("MX"), { timeoutMs: 5500 }),
    ]);
    const out: Evidence[] = [];

    const t = parse(txt);
    if (t) {
      const blob = (t.Answer ?? [])
        .filter((a) => a.type === 16)
        .map((a) => a.data.toLowerCase())
        .join("\n");
      const services = [...new Set(TXT_SERVICES.filter(([k]) => blob.includes(k)).map(([, s]) => s))];
      out.push({
        id: "dns:email-stack",
        collector: "dns",
        claim: services.length
          ? `DNS TXT records of ${d} reference ${services.length} business services: ${services.join(", ")}.`
          : `DNS TXT records of ${d} reference no known business services.`,
        url: txt.url,
        tier: "claimed",
        polarity: services.length >= 3 ? "supports" : "neutral",
        strength: 2,
        source: "Google Public DNS",
        fetched_at: txt.fetched_at,
        verified: true,
        data: { services: services.join(", "), service_count: services.length },
      });
    }

    const m = parse(mx);
    if (m) {
      const hosts = (m.Answer ?? [])
        .filter((a) => a.type === 15)
        .map((a) => (a.data.split(" ")[1] ?? "").toLowerCase().replace(/\.$/, ""));
      const provider = hosts.length
        ? (MX_PROVIDERS.find(([k]) => hosts.some((h) => h.includes(k)))?.[1] ?? "a self-run or other mail host")
        : null;
      out.push({
        id: "dns:mx",
        collector: "dns",
        claim: provider
          ? `Mail for ${d} is handled by ${provider} (MX ${hosts[0]}).`
          : `${d} publishes no MX records, so it cannot receive email.`,
        url: mx.url,
        tier: "claimed",
        polarity: provider ? "neutral" : "undermines",
        strength: 1,
        source: "Google Public DNS",
        fetched_at: mx.fetched_at,
        verified: true,
        data: { mx_provider: provider, mx_count: hosts.length },
      });
    }
    return out;
  },
};
