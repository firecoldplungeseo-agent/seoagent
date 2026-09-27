import { BAD_DAMAGE, BAD_TITLE, CRITERIA, GOOD_DAMAGE } from './criteria.js';
import { landedCost, type CostBreakdown } from './cost.js';
import { listingKey, type Listing } from './listing.js';
import type { VinInfo } from './vin.js';

export interface Evaluation {
  key: string;
  listing: Listing;
  cost: CostBreakdown;
  verdict: 'deal' | 'stretch' | 'rejected';
  reasons: string[]; // why rejected
  flags: string[]; // things to verify before bidding
  score: number;
}

const has = (text: string, words: readonly string[]) => {
  const t = text.toLowerCase();
  return words.filter((w) => t.includes(w));
};

export function evaluate(l: Listing, vin: VinInfo | null): Evaluation {
  const reasons: string[] = [];
  const flags: string[] = [];
  const cost = landedCost(l);

  if (vin) {
    if (!/tesla/i.test(vin.make)) reasons.push(`VIN decodes to ${vin.make}, not Tesla`);
    if (vin.year && vin.year !== l.year) flags.push(`VIN says ${vin.year}, listing says ${l.year}`);
  } else if (l.vin) {
    flags.push('VIN not verified (NHTSA lookup unavailable) — decode it at vpic.nhtsa.dot.gov');
  } else {
    flags.push('No VIN in listing — get it before bidding');
  }

  const year = vin?.year ?? l.year;
  if (year < CRITERIA.minYear) reasons.push(`${year} is older than ${CRITERIA.minYear}`);

  const badTitle = has(l.title, BAD_TITLE);
  if (badTitle.length) reasons.push(`title: ${badTitle.join(', ')}`);
  else if (!/clean|certificate of title|clear/i.test(l.title)) flags.push(`Title "${l.title}" — confirm it is clean`);

  const badDamage = has(l.damage, BAD_DAMAGE);
  const goodDamage = has(l.damage, GOOD_DAMAGE);
  if (badDamage.length) reasons.push(`damage: ${badDamage.join(', ')}`);
  else if (!goodDamage.length) flags.push(`Damage "${l.damage}" — confirm it is cosmetic only`);

  if (l.mileage != null && l.mileage > CRITERIA.maxMileage) {
    reasons.push(`${l.mileage.toLocaleString()} mi is over ${CRITERIA.maxMileage.toLocaleString()}`);
  }
  if (cost.allIn > CRITERIA.maxAllIn) reasons.push(`all-in $${cost.allIn.toLocaleString()} over $${CRITERIA.maxAllIn.toLocaleString()}`);

  if (l.priceType === 'current_bid') flags.push('Price is the current bid — final will be higher');
  if (year <= 2020) flags.push('Battery warranty (8 yr) ends ~' + (year + 8) + ' — check in-service date');
  flags.push('Run NMVTIS/Carfax for prior total-loss records');

  const verdict = reasons.length ? 'rejected' : cost.allIn <= CRITERIA.targetAllIn ? 'deal' : 'stretch';

  // Higher is better: cheaper, newer, fewer miles, the "right" kind of damage.
  const modelBonus = /model (y|s|x)/i.test(l.model) ? 800 : 0;
  const score =
    (CRITERIA.maxAllIn - cost.allIn) +
    (year - CRITERIA.minYear) * 700 +
    modelBonus +
    (goodDamage.includes('hail') ? 300 : 0) -
    (l.mileage ?? 90_000) * 0.01 -
    (l.priceType === 'current_bid' ? 500 : 0);

  return { key: listingKey(l), listing: l, cost, verdict, reasons, flags, score: Math.round(score) };
}

const $ = (n: number) => `$${n.toLocaleString()}`;

// Plain-text email. Every entry carries a "Ref:" line; the scheduled run
// searches sent mail for those refs so a car is never emailed twice.
export function renderEmail(picks: Evaluation[], date: string): { subject: string; body: string } {
  const deals = picks.filter((p) => p.verdict === 'deal').length;
  const subject = `Tesla hunt ${date}: ${picks.length} new (${deals} under ${$(CRITERIA.targetAllIn)} all-in)`;
  const lines: string[] = [
    `${picks.length} new Tesla listing${picks.length === 1 ? '' : 's'} that fit: ${CRITERIA.minYear}+, clean title, cosmetic/hail damage, all-in (incl. ${$(CRITERIA.deliveryCost)} delivery) near ${$(CRITERIA.targetAllIn)}.`,
    '',
  ];
  picks.forEach((p, i) => {
    const l = p.listing;
    const c = p.cost;
    lines.push(`${i + 1}. ${l.year} Tesla ${l.model}${l.trim ? ' ' + l.trim : ''} — ${p.verdict === 'deal' ? 'DEAL' : 'STRETCH'}`);
    lines.push(`   ${$(l.price)} ${l.priceType.replace('_', ' ')} | ${l.mileage != null ? l.mileage.toLocaleString() + ' mi' : 'miles ?'} | ${l.location ?? 'location ?'} | ${l.source}`);
    lines.push(`   All-in ~${$(c.allIn)} = ${$(c.price)} + ${$(c.fees)} fees + ${$(c.delivery)} delivery + ${$(c.tax)} tax`);
    lines.push(`   Title: ${l.title} | Damage: ${l.damage}`);
    if (l.endsAt) lines.push(`   Ends: ${l.endsAt}`);
    if (l.notes) lines.push(`   Notes: ${l.notes}`);
    lines.push(`   Check: ${p.flags.join('; ')}`);
    lines.push(`   ${l.url}`);
    lines.push(`   Ref: ${p.key}`);
    lines.push('');
  });
  lines.push('Fee and tax numbers are estimates. Verify title history before bidding.');
  return { subject, body: lines.join('\n') };
}
