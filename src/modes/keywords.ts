import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import pLimit from 'p-limit';
import { DataForSeoClient } from '../lib/dataforseo.js';
import type { SerpOrganicItem } from '../lib/dataforseo.js';

export type Cluster = 'commercial' | 'beauty';

export interface KeywordRow {
  keyword: string;
  cluster: Cluster;
  search_volume: number | null;
  cpc: number | null;
  competition_level: string | null;
  top_3_domains: string;
  top_10_domains: string;
}

export async function loadSeed(cluster: Cluster, repoRoot: string): Promise<string[]> {
  const path = join(repoRoot, 'keywords', 'seeds', `${cluster}.txt`);
  const raw = await readFile(path, 'utf-8');
  return raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'));
}

export interface ResearchOptions {
  cluster: Cluster;
  limit?: number;
  skipSerp?: boolean;
  outDir: string;
  repoRoot: string;
}

export async function runKeywordResearch(opts: ResearchOptions): Promise<void> {
  const { cluster, limit, skipSerp, outDir, repoRoot } = opts;

  const seeds = await loadSeed(cluster, repoRoot);
  const target = typeof limit === 'number' ? seeds.slice(0, limit) : seeds;
  console.log(`[keywords] cluster=${cluster} seeds=${seeds.length} target=${target.length} skipSerp=${!!skipSerp}`);

  const dfs = DataForSeoClient.fromEnv();
  const before = await dfs.balance();
  console.log(`[keywords] DataForSEO balance: $${before.balance.toFixed(4)} (login: ${before.login})`);

  console.log(`[keywords] fetching search volume (1 batched call)...`);
  const volumes = await dfs.searchVolume(target);
  const volMap = new Map(volumes.map((v) => [v.keyword.toLowerCase(), v]));

  const serpMap = new Map<string, SerpOrganicItem[]>();
  if (!skipSerp) {
    console.log(`[keywords] fetching SERP top-10 (${target.length} calls @ ~$0.0006 = $${(target.length * 0.0006).toFixed(4)})...`);
    const lim = pLimit(4);
    await Promise.all(
      target.map((kw) =>
        lim(async () => {
          const r = await dfs.serpOrganic(kw);
          serpMap.set(kw.toLowerCase(), r.items);
        }),
      ),
    );
  }

  const rows: KeywordRow[] = target.map((kw) => {
    const v = volMap.get(kw.toLowerCase());
    const items = serpMap.get(kw.toLowerCase()) ?? [];
    return {
      keyword: kw,
      cluster,
      search_volume: v?.search_volume ?? null,
      cpc: v?.cpc ?? null,
      competition_level: v?.competition_level ?? null,
      top_3_domains: items.slice(0, 3).map((i) => i.domain).join(' | '),
      top_10_domains: items.slice(0, 10).map((i) => i.domain).join(' | '),
    };
  });

  const domainCounts = new Map<string, number>();
  for (const items of serpMap.values()) {
    for (const it of items) {
      domainCounts.set(it.domain, (domainCounts.get(it.domain) ?? 0) + 1);
    }
  }
  const topCompetitors = Array.from(domainCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  await mkdir(join(outDir, 'research'), { recursive: true });
  await mkdir(join(outDir, '..', 'competitors'), { recursive: true });

  const datePart = new Date().toISOString().slice(0, 10);
  const csvPath = join(outDir, 'research', `${cluster}-${datePart}.csv`);
  const compPath = join(outDir, '..', 'competitors', `${cluster}-auto-${datePart}.md`);

  await writeFile(csvPath, rowsToCsv(rows), 'utf-8');
  await writeFile(compPath, competitorsToMarkdown(cluster, topCompetitors), 'utf-8');

  const after = await dfs.balance();
  const spent = before.balance - after.balance;
  console.log(``);
  console.log(`[keywords] ✓ Output:`);
  console.log(`  ${csvPath}`);
  console.log(`  ${compPath}`);
  console.log(`[keywords] DataForSEO spend this run: $${spent.toFixed(4)} (remaining: $${after.balance.toFixed(4)})`);
}

function rowsToCsv(rows: KeywordRow[]): string {
  const headers = ['keyword', 'cluster', 'search_volume', 'cpc', 'competition_level', 'top_3_domains', 'top_10_domains'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvCell((r as unknown as Record<string, unknown>)[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

function csvCell(v: unknown): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function competitorsToMarkdown(cluster: Cluster, entries: Array<[string, number]>): string {
  const lines: string[] = [];
  lines.push(`# Auto-detected competitors — ${cluster} cluster`);
  lines.push(``);
  lines.push(`Domains appearing most in SERP top-10 across our tracked ${cluster} keywords.`);
  lines.push(``);
  lines.push(`| Domain | SERP appearances |`);
  lines.push(`|---|---|`);
  for (const [domain, count] of entries) {
    lines.push(`| ${domain} | ${count} |`);
  }
  return lines.join('\n') + '\n';
}
