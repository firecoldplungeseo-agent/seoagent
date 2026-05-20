import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AuditReport, FixItem, PageAudit, Severity } from './types.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'important', 'nice'];
const SEVERITY_LABEL: Record<Severity, string> = {
  critical: '🔴 Critical',
  important: '🟡 Important',
  nice: '🟢 Nice',
};

export function buildTopFixes(pages: PageAudit[], limit = 20): FixItem[] {
  const grouped = new Map<string, FixItem>();

  for (const page of pages) {
    for (const r of page.rules) {
      if (r.passed) continue;
      const key = r.id;
      const existing = grouped.get(key);
      if (existing) {
        existing.affectedUrls.push(page.url);
      } else {
        grouped.set(key, {
          severity: r.severity,
          ruleId: r.id,
          issue: r.message,
          affectedUrls: [page.url],
        });
      }
    }
  }

  return Array.from(grouped.values())
    .sort((a, b) => {
      const sa = SEVERITY_ORDER.indexOf(a.severity);
      const sb = SEVERITY_ORDER.indexOf(b.severity);
      if (sa !== sb) return sa - sb;
      return b.affectedUrls.length - a.affectedUrls.length;
    })
    .slice(0, limit);
}

export function buildReport(domain: string, pages: PageAudit[], pagesDiscovered: number): AuditReport {
  const failed = pages.filter((p) => p.error || p.status >= 400);
  const counts = { critical: 0, important: 0, nice: 0 };
  for (const p of pages) {
    for (const r of p.rules) {
      if (!r.passed) counts[r.severity]++;
    }
  }
  return {
    domain,
    generatedAt: new Date().toISOString(),
    pagesDiscovered,
    pagesCrawled: pages.length,
    pagesFailed: failed.length,
    counts,
    pages,
    topFixes: buildTopFixes(pages),
  };
}

export function reportToMarkdown(r: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# SEO Audit — ${r.domain}`);
  lines.push('');
  lines.push(`**Generated:** ${r.generatedAt}`);
  lines.push(`**Pages discovered:** ${r.pagesDiscovered}`);
  lines.push(`**Pages crawled:** ${r.pagesCrawled}`);
  lines.push(`**Pages failed:** ${r.pagesFailed}`);
  lines.push('');
  lines.push(`## Issue counts`);
  lines.push('');
  lines.push(`| Severity | Count |`);
  lines.push(`|---|---|`);
  lines.push(`| 🔴 Critical | ${r.counts.critical} |`);
  lines.push(`| 🟡 Important | ${r.counts.important} |`);
  lines.push(`| 🟢 Nice | ${r.counts.nice} |`);
  lines.push('');

  lines.push(`## Top fixes (prioritized)`);
  lines.push('');
  if (r.topFixes.length === 0) {
    lines.push('_No issues found._');
  } else {
    for (const fix of r.topFixes) {
      lines.push(`### ${SEVERITY_LABEL[fix.severity]} — ${fix.issue}`);
      lines.push(`Rule: \`${fix.ruleId}\` · Affected pages: **${fix.affectedUrls.length}**`);
      lines.push('');
      const sample = fix.affectedUrls.slice(0, 5);
      for (const u of sample) lines.push(`- ${u}`);
      if (fix.affectedUrls.length > sample.length) {
        lines.push(`- … and ${fix.affectedUrls.length - sample.length} more`);
      }
      lines.push('');
    }
  }

  lines.push(`## Per-page detail`);
  lines.push('');
  for (const p of r.pages) {
    const failedRules = p.rules.filter((x) => !x.passed);
    const status = p.error ? `❌ ${p.error}` : `HTTP ${p.status}`;
    lines.push(`### ${p.url}`);
    lines.push(`Status: ${status} · ${failedRules.length} issue(s)`);
    if (p.lighthouse) {
      const l = p.lighthouse;
      lines.push(
        `Lighthouse — perf: ${l.performance ?? '–'} · seo: ${l.seo ?? '–'} · a11y: ${l.accessibility ?? '–'} · LCP: ${l.lcpMs ?? '–'}ms · CLS: ${l.cls ?? '–'}`,
      );
    }
    if (failedRules.length > 0) {
      for (const fr of failedRules) {
        lines.push(`- ${SEVERITY_LABEL[fr.severity]} \`${fr.id}\` — ${fr.message}`);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

export async function writeReport(
  report: AuditReport,
  outDir: string,
): Promise<{ mdPath: string; jsonPath: string }> {
  await mkdir(outDir, { recursive: true });
  const datePart = report.generatedAt.slice(0, 10);
  const slug = report.domain.replace(/^https?:\/\//, '').replace(/[^a-z0-9-]/gi, '-');
  const mdPath = join(outDir, `${slug}-${datePart}.md`);
  const jsonPath = join(outDir, `${slug}-${datePart}.json`);
  await writeFile(mdPath, reportToMarkdown(report), 'utf-8');
  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  return { mdPath, jsonPath };
}
