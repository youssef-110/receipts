// Collector registry. Imports every collector file once so nobody else needs to edit this file.

import type { Collector, Mode } from "../types";
import { aliveCollector } from "./alive";
import { certsCollector } from "./certs";
import { dnsCollector } from "./dns";
import { marketplaceCollectors } from "./marketplace/index";
import { mentionsCollector } from "./mentions";
import { rdapCollector } from "./rdap";
import { registersCollector } from "./registers";
import { riskCollector } from "./risk";
import { shopCollectors } from "./shop/index";
import { siteClaimsCollector } from "./site";
import { waybackCollector } from "./wayback";

export const allCollectors: Collector[] = [
  siteClaimsCollector,
  rdapCollector,
  waybackCollector,
  certsCollector,
  dnsCollector,
  aliveCollector,
  mentionsCollector,
  registersCollector,
  riskCollector,
  ...shopCollectors,
  ...marketplaceCollectors,
];

export function collectorsFor(mode: Mode): Collector[] {
  return allCollectors.filter((c) => c.modes.includes(mode));
}
