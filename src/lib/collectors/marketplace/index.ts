import type { Collector } from "../../types";
import { brandCollector, priceCollector, sellerCollector } from "./checks";
import { imagesCollector } from "./images";
import { listingCollector } from "./listing";

// WP9 marketplace collectors. All share one parsed listing per run (see listing.ts getListing).
export const marketplaceCollectors: Collector[] = [listingCollector, priceCollector, brandCollector, sellerCollector, imagesCollector];
