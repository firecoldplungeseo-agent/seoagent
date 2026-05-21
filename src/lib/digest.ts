import type { RankDelta } from './rank.js';

export interface DomainAuditSummary {
  domain: string;
  pagesCrawled: number;
  counts: { critical: number; important: number; nice: number };
  delta?: { critical: number; important: number; nice: number };
}

export interface DigestInput {
  date: string;
  previousDate: string | null;
  audits: DomainAuditSummary[];
  rankDeltas: RankDelta[];
  totalSerpsChecked: number;
  dataForSeoSpend: number;
}

export function generateDigest(d: DigestInput): string {
  const lines: string[] = [];

  lines.push(`# SEO Weekly Digest — ${d.date}`);
  lines.push(``);
  lines.push(d.previousDate
    ? `Comparison vs **${d.previousDate}** snapshot.`
    : `**First snapshot** — baseline only, no week-over-week comparison yet.`);
  lines.push(``);

  // -- TL;DR --
  lines.push(`## TL;DR`);
  lines.push(``);
  const entered = d.rankDeltas.filter((r) => r.movement === 'entered');
  const left = d.rankDeltas.filter((r) => r.movement === 'left');
  const ups = d.rankDeltas.filter((r) => r.movement === 'up');
  const downs = d.rankDeltas.filter((r) => r.movement === 'down');
  const inTop10 = d.rankDeltas.filter((r) => r.current != null).length;
  const totalTracked = d.rankDeltas.length;

  if (d.previousDate) {
    lines.push(`- **🟢 New top-10 entries:** ${entered.length}`);
    lines.push(`- **🔴 Dropped from top 10:** ${left.length}`);
    lines.push(`- **⬆ Improved rank:** ${ups.length}`);
    lines.push(`- **⬇ Worsened rank:** ${downs.length}`);
  }
  lines.push(`- **Currently in top 10:** ${inTop10} / ${totalTracked} domain-keyword pairs`);
  for (const a of d.audits) {
    const deltaSuffix = a.delta
      ? ` (Δ ${formatSigned(a.delta.critical)} critical, ${formatSigned(a.delta.important)} important)`
      : '';
    lines.push(`- **${a.domain}:** ${a.counts.critical} critical, ${a.counts.important} important${deltaSuffix}`);
  }
  lines.push(``);

  // -- Movers --
  if (d.previousDate) {
    if (entered.length > 0) {
      lines.push(`## 🟢 New top-10 entries this week`);
      lines.push(``);
      for (const r of entered) {
        lines.push(`- **${r.keyword}** (${r.cluster}) — ${r.domain} entered at rank ${r.current}`);
      }
      lines.push(``);
    }
    if (left.length > 0) {
      lines.push(`## 🔴 Dropped out of top 10`);
      lines.push(``);
      for (const r of left) {
        lines.push(`- **${r.keyword}** (${r.cluster}) — ${r.domain} fell from rank ${r.previous} → out`);
      }
      lines.push(``);
    }
    if (ups.length > 0) {
      lines.push(`## ⬆ Improved within top 10`);
      lines.push(``);
      for (const r of ups) {
        lines.push(`- **${r.keyword}** (${r.cluster}) — ${r.domain}: ${r.previous} → ${r.current}`);
      }
      lines.push(``);
    }
    if (downs.length > 0) {
      lines.push(`## ⬇ Worsened within top 10`);
      lines.push(``);
      for (const r of downs) {
        lines.push(`- **${r.keyword}** (${r.cluster}) — ${r.domain}: ${r.previous} → ${r.current}`);
      }
      lines.push(``);
    }
  }

  // -- Current top-10 standings --
  lines.push(`## Currently ranking (top 10)`);
  lines.push(``);
  const inTop = d.rankDeltas.filter((r) => r.current != null);
  if (inTop.length === 0) {
    lines.push(`_No tracked keywords ranking in top 10 right now._`);
  } else {
    lines.push(`| Domain | Keyword | Cluster | Rank |`);
    lines.push(`|---|---|---|---|`);
    for (const r of inTop.sort((a, b) => (a.current ?? 99) - (b.current ?? 99))) {
      lines.push(`| ${r.domain} | ${r.keyword} | ${r.cluster} | ${r.current} |`);
    }
  }
  lines.push(``);

  // -- Audit snapshot --
  lines.push(`## Audit snapshot`);
  lines.push(``);
  lines.push(`| Domain | Pages | Critical | Important | Nice |`);
  lines.push(`|---|---|---|---|---|`);
  for (const a of d.audits) {
    lines.push(`| ${a.domain} | ${a.pagesCrawled} | ${a.counts.critical} | ${a.counts.important} | ${a.counts.nice} |`);
  }
  lines.push(``);

  // -- Cost --
  lines.push(`## Run cost`);
  lines.push(``);
  lines.push(`- DataForSEO SERP queries: ${d.totalSerpsChecked}`);
  lines.push(`- DataForSEO spend this run: $${d.dataForSeoSpend.toFixed(4)}`);
  lines.push(``);

  // -- Recommendations --
  lines.push(`## Recommended actions`);
  lines.push(``);
  const recs = generateRecommendations(d);
  if (recs.length === 0) {
    lines.push(`_No urgent actions this week._`);
  } else {
    for (const rec of recs) lines.push(`- ${rec}`);
  }
  lines.push(``);
  return lines.join('\n');
}

function formatSigned(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function generateRecommendations(d: DigestInput): string[] {
  const recs: string[] = [];
  const left = d.rankDeltas.filter((r) => r.movement === 'left');
  for (const r of left.slice(0, 3)) {
    recs.push(`Investigate why ${r.domain} dropped out of top 10 for "${r.keyword}" — was ranked ${r.previous}.`);
  }
  const stillAbsent = d.rankDeltas.filter((r) => r.movement === 'still_absent');
  if (stillAbsent.length >= 5) {
    recs.push(`${stillAbsent.length} tracked keywords still not in top 100 — consider content or backlinks for high-volume gaps.`);
  }
  for (const a of d.audits) {
    if (a.delta && a.delta.critical > 0) {
      recs.push(`${a.domain}: ${a.delta.critical} new critical issues introduced this week — re-run audit + diff fixes.`);
    }
  }
  return recs;
}
