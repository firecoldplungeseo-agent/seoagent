import { z } from 'zod';

export const ListingSchema = z.object({
  source: z.string(), // copart | iaai | cargurus | autotrader | cars.com | facebook | dealer | ...
  url: z.string().url(),
  id: z.string().optional(), // lot number / listing id
  vin: z.string().length(17).optional(),
  year: z.number().int(),
  model: z.string(), // Model 3 | Model Y | Model S | Model X
  trim: z.string().optional(),
  price: z.number().nonnegative(),
  priceType: z.enum(['asking', 'current_bid', 'buy_now']).default('asking'),
  mileage: z.number().int().nonnegative().optional(),
  title: z.string().default('unknown'), // e.g. "clean", "TX - Certificate of Title"
  damage: z.string().default('unknown'), // primary + secondary damage, free text
  location: z.string().optional(), // "Dallas, TX"
  endsAt: z.string().optional(), // auction end, ISO or free text
  notes: z.string().optional(),
});

export type Listing = z.infer<typeof ListingSchema>;

export function listingKey(l: Listing): string {
  if (l.vin) return `vin:${l.vin.toUpperCase()}`;
  if (l.id) return `${l.source.toLowerCase()}:${l.id}`;
  return `url:${l.url.replace(/[?#].*$/, '')}`;
}
