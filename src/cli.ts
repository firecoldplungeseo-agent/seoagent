#!/usr/bin/env node
import 'dotenv/config';
import { Command } from 'commander';
import { runAudit } from './modes/audit.js';

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
  .command('optimize <url>')
  .description('[Phase 3] Generate optimized title/meta/H1/FAQ + push as Shopify draft')
  .action(async (url: string) => {
    console.log(`[stub] optimize ${url} — Phase 3 not yet implemented`);
    process.exit(1);
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
