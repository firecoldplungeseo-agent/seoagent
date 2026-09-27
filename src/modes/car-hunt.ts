import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { ListingSchema } from '../car-hunt/listing.js';
import { decodeVin } from '../car-hunt/vin.js';
import { evaluate, renderEmail, type Evaluation } from '../car-hunt/evaluate.js';
import { CRITERIA } from '../car-hunt/criteria.js';
import { sendDigestEmail } from '../lib/email.js';

export interface CarHuntOptions {
  input: string; // JSON array of listings
  seen?: string; // text file of refs already emailed, one per line
  out?: string; // write subject + body JSON here
  send: boolean; // send via SMTP (needs GMAIL_USER + GMAIL_APP_PASSWORD)
  skipVin: boolean;
}

export async function runCarHunt(opts: CarHuntOptions): Promise<Evaluation[]> {
  const listings = z.array(ListingSchema).parse(JSON.parse(await readFile(opts.input, 'utf8')));
  const seen = new Set(
    opts.seen && existsSync(opts.seen)
      ? (await readFile(opts.seen, 'utf8')).split('\n').map((s) => s.trim()).filter(Boolean)
      : [],
  );

  const evals: Evaluation[] = [];
  const keys = new Set<string>();
  for (const l of listings) {
    const vin = l.vin && !opts.skipVin ? await decodeVin(l.vin) : null;
    const e = evaluate(l, vin);
    if (keys.has(e.key)) continue; // same car listed twice in this batch
    keys.add(e.key);
    evals.push(e);
  }

  for (const e of evals) {
    const tag = seen.has(e.key) ? 'seen' : e.verdict;
    console.log(`[car-hunt] ${tag.padEnd(8)} ${e.key}  $${e.cost.allIn} all-in  ${e.reasons.join('; ')}`);
  }

  const picks = evals
    .filter((e) => e.verdict !== 'rejected' && !seen.has(e.key))
    .sort((a, b) => b.score - a.score);

  if (!picks.length) {
    console.log('[car-hunt] nothing new — no email');
    if (opts.out) await writeFile(opts.out, JSON.stringify({ send: false }, null, 2));
    return picks;
  }

  const today = new Date().toISOString().slice(0, 10);
  const email = renderEmail(picks, today);
  console.log(`\n${email.subject}\n\n${email.body}`);
  if (opts.out) {
    await writeFile(opts.out, JSON.stringify({ send: true, to: CRITERIA.recipient, ...email, refs: picks.map((p) => p.key) }, null, 2));
  }
  if (opts.send) {
    await sendDigestEmail({ ...email, recipients: [CRITERIA.recipient], fromName: 'Tesla Hunt' });
    console.log(`[car-hunt] emailed ${CRITERIA.recipient}`);
  }
  return picks;
}
