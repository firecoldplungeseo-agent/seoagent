import pLimit from 'p-limit';
import { discoverSitemaps, expandSitemap, crawlPages } from '../lib/crawler.js';
import { getLighthouse } from '../lib/pagespeed.js';
import { runRules } from '../lib/rules.js';
import { buildReport, writeReport } from '../lib/report.js';
import type { PageAudit, LighthouseResult } from '../lib/types.js';

export interface AuditOptions {
  domain: string;
  outDir: string;
  maxPages: number;
  lighthouseMode: 'none' | 'homepage' | 'top' | 'all';
  lighthouseTopN: number;
  crawlConcurrency: number;
}

export async function runAudit(opts: AuditOptions): Promise<void> {
  const { domain, outDir, maxPages, lighthouseMode, lighthouseTopN, crawlConcurrency } = opts;

  console.log(`[audit] ${domain} — discovering sitemaps...`);
  const sitemaps = await discoverSitemaps(domain);
  if (sitemaps.length === 0) {
    console.warn(`[audit] no sitemaps found — falling back to homepage only`);
  } else {
    console.log(`[audit] sitemaps: ${sitemaps.length} found`);
  }

  const allUrls = new Set<string>();
  for (const sm of sitemaps) {
    const urls = await expandSitemap(sm);
    for (const u of urls) allUrls.add(u);
  }
  if (allUrls.size === 0) {
    const homepage = domain.startsWith('http') ? domain : `https://${domain}`;
    allUrls.add(homepage);
  }

  const urls = Array.from(allUrls).slice(0, maxPages);
  console.log(`[audit] crawling ${urls.length} pages (cap ${maxPages})...`);

  const crawled = await crawlPages(urls, domain, crawlConcurrency);
  console.log(`[audit] crawl complete — running rule checks...`);

  const lhTargets = selectLighthouseTargets(urls, lighthouseMode, lighthouseTopN);
  const lhMap = new Map<string, LighthouseResult | null>();
  if (lhTargets.length > 0) {
    console.log(`[audit] Lighthouse checks: ${lhTargets.length} pages...`);
    const lhLimit = pLimit(2);
    await Promise.all(
      lhTargets.map((u) =>
        lhLimit(async () => {
          const r = await getLighthouse(u);
          lhMap.set(u, r);
        }),
      ),
    );
  }

  const pageAudits: PageAudit[] = crawled.map((c) => {
    const lh = lhMap.get(c.url);
    if (!c.meta) {
      return {
        url: c.url,
        status: c.data?.status ?? 0,
        fetchMs: c.data?.fetchMs ?? 0,
        meta: null,
        rules: [],
        error: c.error,
        lighthouse: lh ?? null,
      };
    }
    return {
      url: c.url,
      status: c.data!.status,
      fetchMs: c.data!.fetchMs,
      meta: c.meta,
      rules: runRules(c.meta, c.url, lh ?? null),
      lighthouse: lh ?? null,
    };
  });

  const report = buildReport(domain, pageAudits, allUrls.size);
  const { mdPath, jsonPath } = await writeReport(report, outDir);
  console.log(``);
  console.log(`[audit] ✓ Report written:`);
  console.log(`  ${mdPath}`);
  console.log(`  ${jsonPath}`);
  console.log(``);
  console.log(`Summary: 🔴 ${report.counts.critical} critical · 🟡 ${report.counts.important} important · 🟢 ${report.counts.nice} nice`);
}

function selectLighthouseTargets(urls: string[], mode: AuditOptions['lighthouseMode'], topN: number): string[] {
  if (mode === 'none') return [];
  if (mode === 'homepage') return urls.slice(0, 1);
  if (mode === 'top') return urls.slice(0, topN);
  return urls;
}
