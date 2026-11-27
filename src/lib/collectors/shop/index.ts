import type { Collector } from "../../types";
import { shopDropshipCollector } from "./dropship";
import { shopLegalCollector } from "./legal";
import { shopPaymentsCollector } from "./payments";
import { shopProductCollector } from "./product";
import { shopWatchlistsCollector } from "./watchlists";

// WP8 owns this folder. Shop-mode collectors (registered via collectors/index.ts).
export const shopCollectors: Collector[] = [
  shopProductCollector,
  shopLegalCollector,
  shopPaymentsCollector,
  shopWatchlistsCollector,
  shopDropshipCollector,
];
