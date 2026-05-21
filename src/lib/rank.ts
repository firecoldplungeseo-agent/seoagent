import type { SerpOrganicItem } from './dataforseo.js';

export function normalizeDomain(domain: string): string {
  return domain.replace(/^www\./i, '').toLowerCase();
}

export function findOurRank(
  serpItems: SerpOrganicItem[],
  ourDomains: string[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const our of ourDomains) {
    const cleanOur = normalizeDomain(our);
    const match = serpItems.find((item) => normalizeDomain(item.domain) === cleanOur);
    result[our] = match ? match.rank : null;
  }
  return result;
}

export interface RankDelta {
  domain: string;
  keyword: string;
  cluster: string;
  previous: number | null;
  current: number | null;
  movement: 'entered' | 'left' | 'up' | 'down' | 'unchanged' | 'still_absent';
}

export function computeRankDelta(
  domain: string,
  keyword: string,
  cluster: string,
  previous: number | null,
  current: number | null,
): RankDelta {
  let movement: RankDelta['movement'];
  if (previous == null && current != null) movement = 'entered';
  else if (previous != null && current == null) movement = 'left';
  else if (previous == null && current == null) movement = 'still_absent';
  else if (previous! < current!) movement = 'down';
  else if (previous! > current!) movement = 'up';
  else movement = 'unchanged';
  return { domain, keyword, cluster, previous, current, movement };
}
