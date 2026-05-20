#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { runAudit } from './modes/audit.js';
import { runKeywordResearch, type Cluster } from './modes/keywords.js';
import { runOptimize, type Cluster as OptCluster } from './modes/optimize.js';

const program = new Command();

program
  .name('seo-agent')
  .description('SEO automation for the Plunge Zero portfolio')
  .version('0.1.0');

program
  .command('audit <domain>')
  .description('Full technical SEO audit — sitemap crawl + Lighthouse + rule checks')
  .option('-o, --out <dir>', 'output directory for reports', './reports')
  .option('-m, --max-pages <n>', 'maximum pages to crawl', (v) => parseInt(v, 10), 100)
  .option(
    '--lighthouse <mode>',
    'lighthouse coverage: none | homepage | top | all',
    'homepage',
  )
  .option('--lighthouse-top <n>', 'when --lighthouse=top, how many pages', (v) => parseInt(v, 10), 5)
  .option('-c, --concurrency <n>', 'concurrent page fetches', (v) => parseInt(v, 10), 5)
  .action(async (domain: string, opts) => {
    await runAudit({
      domain,
      outDir: opts.out,
      maxPages: opts.maxPages,
      lighthouseMode: opts.lighthouse,
      lighthouseTopN: opts.lighthouseTop,
      crawlConcurrency: opts.concurrency,
    });
  });

program
  .command('keywords <action>')
  .description('Keyword research: action = research | balance')
  .option('-c, --cluster <name>', 'commercial | beauty', 'commercial')
  .option('-l, --limit <n>', 'cap keywords processed', (v) => parseInt(v, 10))
  .option('--skip-serp', 'skip SERP fetches (cheaper, no competitor data)', false)
  .option('-o, --out <dir>', 'output directory under keywords/', './keywords')
  .action(async (action: string, opts) => {
    if (action === 'research') {
      await runKeywordResearch({
        cluster: opts.cluster as Cluster,
        limit: opts.limit,
        skipSerp: opts.skipSerp,
        outDir: opts.out,
        repoRoot: process.cwd(),
      });
    } else if (action === 'balance') {
      const { DataForSeoClient } = await import('./lib/dataforseo.js');
      const c = DataForSeoClient.fromEnv();
      const b = await c.balance();
      console.log(`DataForSEO balance: $${b.balance.toFixed(4)} (login: ${b.login})`);
    } else {
      console.error(`Unknown action: ${action}. Use: research | balance`);
      process.exit(1);
    }
  });

program
  .command('optimize <url>')
  .description('Generate optimized title/meta/H1/FAQ for a page — output as draft markdown')
  .option('-c, --cluster <name>', 'commercial | beauty | residential', 'commercial')
  .option('-o, --out <dir>', 'output directory', './optimizations')
  .action(async (url: string, opts) => {
    await runOptimize({
      url,
      cluster: opts.cluster as OptCluster,
      outDir: opts.out,
      repoRoot: process.cwd(),
    });
  });

program
  .command('weekly')
  .description('[Phase 4] Weekly cron: rank delta + competitor scan + CWV regression + digest')
  .action(async () => {
    console.log('[stub] weekly — Phase 4 not yet implemented');
    process.exit(1);
  });

program
  .command('cannibalize')
  .description('[Phase 5] Portfolio-wide cannibalization analysis')
  .action(async () => {
    console.log('[stub] cannibalize — Phase 5 not yet implemented');
    process.exit(1);
  });

program.parseAsync(process.argv);
