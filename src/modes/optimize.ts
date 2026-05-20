import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchPage, parsePage } from '../lib/crawler.js';
import { optimizePage, type Optimization } from '../lib/optimizer.js';

export type Cluster = 'commercial' | 'beauty' | 'residential';

export interface OptimizeOptions {
  url: string;
  cluster: Cluster;
  outDir: string;
  repoRoot: string;
}

export async function runOptimize(opts: OptimizeOptions): Promise<void> {
  const { url, cluster, outDir, repoRoot } = opts;

  console.log(`[optimize] ${url} (cluster: ${cluster})`);
  console.log(`[optimize] fetching page...`);
  const data = await fetchPage(url);
  if (data.status >= 400) {
    throw new Error(`Failed to fetch ${url}: HTTP ${data.status}`);
  }
  const domain = new URL(url).host;
  const meta = parsePage(data, domain);

  console.log(`[optimize] loading target keywords from cluster: ${cluster}`);
  const targetKeywords = await loadSeed(cluster, repoRoot);

  console.log(`[optimize] loading competitor snippets...`);
  const competitorSnippets = await loadCompetitorSnippets(cluster, repoRoot);

  console.log(`[optimize] calling Anthropic (Opus 4.7, adaptive thinking)...`);
  const result = await optimizePage({
    url,
    domain,
    currentMeta: meta,
    targetKeywords,
    competitorSnippets,
  });

  const datePart = new Date().toISOString().slice(0, 10);
  const slug = urlToSlug(url);
  await mkdir(outDir, { recursive: true });
  const mdPath = join(outDir, `${slug}-${datePart}.md`);
  const jsonPath = join(outDir, `${slug}-${datePart}.json`);

  await writeFile(mdPath, formatMarkdown(url, meta, result), 'utf-8');
  await writeFile(jsonPath, JSON.stringify({ url, current: meta, optimized: result }, null, 2), 'utf-8');

  console.log(``);
  console.log(`[optimize] ✓ Draft optimization written:`);
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
  console.log(``);
  console.log(`Review the markdown file, then apply the changes in Shopify as a draft.`);
}

async function loadSeed(cluster: Cluster, repoRoot: string): Promise<string[]> {
  const path = join(repoRoot, 'keywords', 'seeds', `${cluster}.txt`);
  if (!existsSync(path)) {
    console.warn(`[optimize] seed file not found: ${path} — proceeding with no target keywords`);
    return [];
  }
  const raw = await readFile(path, 'utf-8');
  return raw.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
}

async function loadCompetitorSnippets(
  cluster: Cluster,
  repoRoot: string,
): Promise<Array<{ keyword: string; topDomains: string[] }>> {
  const dir = join(repoRoot, 'keywords', 'research');
  if (!existsSync(dir)) return [];
  const files = await import('node:fs/promises').then((m) => m.readdir(dir));
  const match = files
    .filter((f) => f.startsWith(`${cluster}-`) && f.endsWith('.csv'))
    .sort()
    .pop();
  if (!match) return [];
  const csv = await readFile(join(dir, match), 'utf-8');
  const lines = csv.split('\n').slice(1).filter((l) => l.trim());
  const snippets: Array<{ keyword: string; topDomains: string[] }> = [];
  for (const line of lines) {
    const cells = parseCsvLine(line);
    const keyword = cells[0];
    const top10 = (cells[6] ?? '').split(' | ').filter((s) => s);
    if (keyword && top10.length > 0) {
      snippets.push({ keyword, topDomains: top10.slice(0, 5) });
    }
  }
  return snippets.slice(0, 10);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function urlToSlug(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')
    .replace(/[^a-z0-9-]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function formatMarkdown(url: string, current: { title: string | null; metaDescription: string | null; h1s: string[] }, opt: Optimization): string {
  const lines: string[] = [];
  lines.push(`# SEO Optimization Draft — ${url}`);
  lines.push(``);
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(``);
  lines.push(`## Before vs After`);
  lines.push(``);
  lines.push(`### Title`);
  lines.push(``);
  lines.push(`- **Current:** ${current.title ?? '_(missing)_'}`);
  lines.push(`- **Proposed:** ${opt.title}`);
  lines.push(``);
  lines.push(`### Meta description`);
  lines.push(``);
  lines.push(`- **Current:** ${current.metaDescription ?? '_(missing)_'}`);
  lines.push(`- **Proposed:** ${opt.meta_description}`);
  lines.push(``);
  lines.push(`### H1`);
  lines.push(``);
  lines.push(`- **Current:** ${current.h1s[0] ?? '_(missing)_'}`);
  lines.push(`- **Proposed:** ${opt.h1}`);
  lines.push(``);
  lines.push(`## FAQ (add as Shopify FAQ section + FAQ JSON-LD schema)`);
  lines.push(``);
  for (const f of opt.faq_items) {
    lines.push(`### ${f.question}`);
    lines.push(``);
    lines.push(f.answer);
    lines.push(``);
  }
  if (opt.recommended_internal_links.length > 0) {
    lines.push(`## Recommended internal links`);
    lines.push(``);
    for (const l of opt.recommended_internal_links) {
      lines.push(`- **${l.anchor_text}** → \`${l.target_path}\` — ${l.reason}`);
    }
    lines.push(``);
  }
  lines.push(`## Target keywords addressed`);
  lines.push(``);
  for (const kw of opt.target_keywords_used) lines.push(`- ${kw}`);
  lines.push(``);
  lines.push(`## Rationale`);
  lines.push(``);
  lines.push(opt.optimization_rationale);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);
  lines.push(`**This is a draft. Review and apply in Shopify admin as an unpublished draft before going live.**`);
  return lines.join('\n');
}
