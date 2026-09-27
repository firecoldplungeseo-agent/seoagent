// Search criteria for the Tesla hunt. Edit here, not in the scheduled prompt.

export const CRITERIA = {
  recipient: 'nickcreed11@gmail.com',
  minYear: 2019,
  // All-in = price + est. auction/dealer fees + delivery + est. tax.
  targetAllIn: 10_000,
  // Listings up to this all-in still get emailed, flagged as "stretch".
  maxAllIn: 11_500,
  deliveryCost: 1_500,
  // Sales tax estimate. Texas is 6.25%; change if registering elsewhere.
  taxRate: 0.0625,
  maxMileage: 150_000,
} as const;

// Title brands that disqualify a car outright.
export const BAD_TITLE = [
  'salvage', 'rebuilt', 'rebuildable', 'reconstructed', 'flood', 'junk',
  'parts only', 'non-repairable', 'certificate of destruction', 'dismantle',
  'total loss', 'lemon', 'buyback',
];

// Damage we will not touch. EV-specific: anything near the battery pack.
export const BAD_DAMAGE = [
  'flood', 'water', 'fire', 'burn', 'frame', 'structural', 'rollover',
  'undercarriage', 'biohazard', 'airbag', 'battery', 'high voltage',
  'electrical', 'mechanical', 'engine', 'motor', 'suspension', 'strip',
  'front end', 'rear end', 'left side', 'right side', 'all over', 'top/roof',
];

// Damage we want: this is where the discount comes from.
export const GOOD_DAMAGE = [
  'hail', 'cosmetic', 'minor dent', 'dents', 'scratch', 'scuff',
  'vandalism', 'normal wear', 'paint', 'none', 'no damage',
];
