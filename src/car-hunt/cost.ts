import { CRITERIA } from './criteria.js';
import type { Listing } from './listing.js';

export interface CostBreakdown {
  price: number;
  fees: number;
  delivery: number;
  tax: number;
  allIn: number;
}

// Rough fee estimates. Copart/IAAI buyer + virtual bid + gate fees run
// ~$700-1,000 on an $8k car; dealers add a doc fee.
export function estimateFees(l: Listing): number {
  const s = l.source.toLowerCase();
  if (s.includes('copart') || s.includes('iaai') || s.includes('auction')) {
    return Math.round(Math.max(600, l.price * 0.1) + 200);
  }
  if (s.includes('facebook') || s.includes('private') || s.includes('craigslist')) return 0;
  return 300;
}

export function landedCost(l: Listing): CostBreakdown {
  const fees = estimateFees(l);
  const delivery = CRITERIA.deliveryCost;
  const tax = Math.round(l.price * CRITERIA.taxRate);
  return { price: l.price, fees, delivery, tax, allIn: l.price + fees + delivery + tax };
}
