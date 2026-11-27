// Host helpers. shortcut: small multi-part TLD list instead of the full Public Suffix List; fine for a demo, swap for `tldts` if wrong results show up.

const MULTI_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "com.au", "net.au", "org.au", "co.nz", "co.jp", "com.br",
  "com.tr", "co.za", "com.mx", "com.cn", "com.hk", "co.in", "co.kr", "com.sg", "com.ar",
]);

// Shared hosting platforms: the registration date of the parent domain says nothing about the site.
const PLATFORM_SUFFIXES = [
  "vercel.app", "netlify.app", "github.io", "myshopify.com", "framer.website", "framer.app",
  "webflow.io", "lovable.app", "pages.dev", "web.app", "firebaseapp.com", "herokuapp.com",
  "wixsite.com", "squarespace.com", "carrd.co", "notion.site", "replit.app", "onrender.com",
];

export function registrableDomain(host: string): string {
  // On shared platforms the tenant's subdomain is the site's own domain (Public Suffix List private section):
  // kontorflow-demo.vercel.app must not be treated as "vercel.app", or every check would research Vercel itself.
  if (isPlatformHost(host)) return host.toLowerCase().replace(/^www\./, "");
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return MULTI_PART_TLDS.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

export function isPlatformHost(host: string): boolean {
  const h = host.toLowerCase();
  return PLATFORM_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}
