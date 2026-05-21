import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import pLimit from 'p-limit';
import { DataForSeoClient, type SerpOrganicItem } from '../lib/dataforseo.js';
import { runAudit } from './audit.js';
import { findOurRank, computeRankDelta, type RankDelta } from '../lib/rank.js';
import { generateDigest, type DomainAuditSummary } from '../lib/digest.js';

type Cluster = 'commercial' | 'residential' | 'beauty';

const OUR_DOMAINS: Record<Cluster, string[]> = {
  commercial: ['firecoldplunge.com', 'plungezero.com'],
  residential: ['firecoldplunge.com'],
  beauty: ['faceplungecompany.com'],
};

const ALL_DOMAINS = ['firecoldplunge.com', 'plungezero.com', 'faceplungecompany.com'];

export interface WeeklyOptions {
  repoRoot: string;
  serpConcurrency: number;
  skipAudit: boolean;
}

interface RankRecord {
  cluster: Cluster;
  serp_top_10: SerpOrganicItem[];
  our_ranks: Record<string, number | null>;
}

interface AuditRecord {
  pagesCrawled: number;
  counts: { critical: number; important: number; nice: number };
}

interface Snapshot {
  date: string;
  rankings: Record<string, RankRecord>;
  audits: Record<string, AuditRecord>;
  totalSerpsChecked: number;
  dataForSeoSpend: number;
}

export async function runWeekly(opts: WeeklyOptions): Promise<void> {
  const { repoRoot, serpConcurrency, skipAudit } = opts;
  const today = new Date().toISOString().slice(0, 10);

  const previous = await loadPreviousSnapshot(repoRoot, today);
  if (previous) {
    console.log(`[weekly] previous snapshot: ${previous.date}`);
  } else {
    console.log(`[weekly] no previous snapshot — building baseline`);
  }

  // ---- 1. Audits ----
  const audits: Record<string, AuditRecord> = {};
  if (!skipAudit) {
    console.log(`[weekly] running audits on ${ALL_DOMAINS.length} domains...`);
    for (const domain of ALL_DOMAINS) {
      try {
        await runAudit({
          domain,
          outDir: join(repoRoot, 'reports'),
          maxPages: 100,
          lighthouseMode: 'none',
          lighthouseTopN: 0,
          crawlConcurrency: 5,
        });
        const counts = await loadLatestAuditCounts(repoRoot, domain);
        audits[domain] = counts;
      } catch (e) {
        console.warn(`[weekly] audit failed for ${domain}: ${(e as Error).message}`);
        audits[domain] = { pagesCrawled: 0, counts: { critical: 0, important: 0, nice: 0 } };
      }
    }
  } else {
    console.log(`[weekly] --skip-audit set, reusing previous snapshot audit counts (if available)`);
    if (previous) Object.assign(audits, previous.audits);
  }

  // ---- 2. Rank tracking via fresh SERPs ----
  console.log(`[weekly] fetching SERPs across 3 clusters...`);
  const dfs = DataForSeoClient.fromEnv();
  const balanceBefore = await dfs.balance();
  console.log(`[weekly] DataForSEO balance before run: $${balanceBefore.balance.toFixed(4)}`);

  const rankings: Record<string, RankRecord> = {};
  let totalSerps = 0;
  for (const cluster of ['commercial', 'residential', 'beauty'] as Cluster[]) {
    const seeds = await loadSeed(cluster, repoRoot);
    if (seeds.length === 0) continue;
    console.log(`[weekly] ${cluster}: ${seeds.length} keywords (~$${(seeds.length * 0.0006).toFixed(4)})`);
    const limit = pLimit(serpConcurrency);
    await Promise.all(
      seeds.map((kw) =>
        limit(async () => {
          try {
            const r = await dfs.serpOrganic(kw);
            const ourRanks = findOurRank(r.items, OUR_DOMAINS[cluster]);
            rankings[`${cluster}::${kw}`] = {
              cluster,
              serp_top_10: r.items,
              our_ranks: ourRanks,
            };
            totalSerps++;
          } catch (e) {
            console.warn(`[weekly] SERP failed for "${kw}": ${(e as Error).message}`);
          }
        }),
      ),
    );
  }
  const balanceAfter = await dfs.balance();
  const spend = balanceBefore.balance - balanceAfter.balance;
  console.log(`[weekly] SERP fetches: ${totalSerps}, spend: $${spend.toFixed(4)}, remaining: $${balanceAfter.balance.toFixed(4)}`);

  // ---- 3. Compute deltas ----
  const rankDeltas: RankDelta[] = [];
  for (const [key, rec] of Object.entries(rankings)) {
    const keyword = key.split('::').slice(1).join('::');
    for (const domain of Object.keys(rec.our_ranks)) {
      const prev = previous?.rankings?.[key]?.our_ranks?.[domain] ?? null;
      const cur = rec.our_ranks[domain];
      rankDeltas.push(computeRankDelta(domain, keyword, rec.cluster, prev, cur));
    }
  }

  // ---- 4. Build audit summary with deltas ----
  const auditSummaries: DomainAuditSummary[] = ALL_DOMAINS.map((domain) => {
    const cur = audits[domain] ?? { pagesCrawled: 0, counts: { critical: 0, important: 0, nice: 0 } };
    const prev = previous?.audits?.[domain];
    return {
      domain,
      pagesCrawled: cur.pagesCrawled,
      counts: cur.counts,
      delta: prev
        ? {
            critical: cur.counts.critical - prev.counts.critical,
            important: cur.counts.important - prev.counts.important,
            nice: cur.counts.nice - prev.counts.nice,
          }
        : undefined,
    };
  });

  // ---- 5. Build and write digest + snapshot ----
  const digest = generateDigest({
    date: today,
    previousDate: previous?.date ?? null,
    audits: auditSummaries,
    rankDeltas,
    totalSerpsChecked: totalSerps,
    dataForSeoSpend: spend,
  });

  await mkdir(join(repoRoot, 'state'), { recursive: true });
  await mkdir(join(repoRoot, 'digests'), { recursive: true });
  const digestPath = join(repoRoot, 'digests', `weekly-${today}.md`);
  const snapshotPath = join(repoRoot, 'state', `snapshot-${today}.json`);

  const snapshot: Snapshot = {
    date: today,
    rankings,
    audits,
    totalSerpsChecked: totalSerps,
    dataForSeoSpend: spend,
  };

  await writeFile(digestPath, digest, 'utf-8');
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf-8');

  console.log(``);
  console.log(`[weekly] ✓ Digest written:`);
  console.log(`  ${digestPath}`);
  console.log(`  ${snapshotPath}`);
  console.log(``);
  const recipient = process.env.DIGEST_EMAIL ?? 'hello@firecoldplunge.com';
  console.log(`Send this digest to ${recipient} (the scheduled agent handles delivery via Gmail MCP).`);
}

async function loadSeed(cluster: Cluster, repoRoot: string): Promise<string[]> {
  const path = join(repoRoot, 'keywords', 'seeds', `${cluster}.txt`);
  if (!existsSync(path)) return [];
  const raw = await readFile(path, 'utf-8');
  return raw.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}

async function loadPreviousSnapshot(repoRoot: string, today: string): Promise<Snapshot | null> {
  const stateDir = join(repoRoot, 'state');
  if (!existsSync(stateDir)) return null;
  const files = await readdir(stateDir);
  const candidates = files
    .filter((f) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter((f) => !f.includes(today))
    .sort();
  const latest = candidates.pop();
  if (!latest) return null;
  const raw = await readFile(join(stateDir, latest), 'utf-8');
  return JSON.parse(raw) as Snapshot;
}

async function loadLatestAuditCounts(repoRoot: string, domain: string): Promise<AuditRecord> {
  const reportsDir = join(repoRoot, 'reports');
  const slug = domain.replace(/^https?:\/\//, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const files = await readdir(reportsDir);
  const latest = files.filter((f) => f.startsWith(slug) && f.endsWith('.json')).sort().pop();
  if (!latest) return { pagesCrawled: 0, counts: { critical: 0, important: 0, nice: 0 } };
  const raw = await readFile(join(reportsDir, latest), 'utf-8');
  const data = JSON.parse(raw);
  return {
    pagesCrawled: data.pagesCrawled ?? 0,
    counts: data.counts ?? { critical: 0, important: 0, nice: 0 },
  };
}
