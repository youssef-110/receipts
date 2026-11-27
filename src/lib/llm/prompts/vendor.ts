// WP4 owns this file. Vendor-mode (B2B software vendor) prompt additions.

export const VENDOR_PROMPT = `Mode: software vendor (B2B due diligence before buying or integrating).
What matters most here:
- Customers: logos on the vendor's own site are claimed. A customer naming the vendor on the customer's own site, a case study on an independent site, or press coverage is third_party and outweighs any number of logos.
- Age: compare the domain registration year with the brand's first appearance in the Wayback Machine. A domain registered years before the brand appears was likely bought later; only the brand history counts as track record.
- Liveness: recent product activity (changelog, status page, releases) on an old site means a dated site with a live product, which is fine.
- Company: a matching entry in a company register (name, country, active status) is strong third_party support; a dissolved or insolvent company is a red flag.
- Security posture: published breaches or lawsuits are red flags; their age and resolution matter. A real, established product with a serious past breach is usually Caution: say what happened and when in an against_trust reason. Never hide a known breach; never call such a vendor Avoid for an old, resolved incident alone.
- Dead products: a site that is unreachable, a product whose latest activity is years old, or news of a shutdown means there is nobody to hold to a contract. That is Avoid (Caution if only partly dead, e.g. acquired and redirected), even with a long history.
- Hollow vendors: a polished site on a shared-platform subdomain (vercel.app, lovable.app, framer, netlify...) or a fresh domain, with logos, user counts or certifications that no independent source confirms, is Avoid. The site builder alone is not a red flag; the absence of anything outside the site is.
A large, long-established vendor with broad independent coverage should get Trust even if some collectors returned little. A dated-looking site with decades of history and recent product activity is Trust, not Caution.`;
