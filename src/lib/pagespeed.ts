import got from 'got';
import type { LighthouseResult } from './types.js';

const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

interface PsiResponse {
  lighthouseResult?: {
    categories?: Record<string, { score: number | null }>;
    audits?: Record<string, { numericValue?: number }>;
  };
  loadingExperience?: {
    metrics?: Record<string, { percentile?: number }>;
  };
}

export async function getLighthouse(
  url: string,
  strategy: 'mobile' | 'desktop' = 'mobile',
): Promise<LighthouseResult | null> {
  const apiKey = process.env.PAGESPEED_API_KEY;
  try {
    const search = new URLSearchParams({ url, strategy });
    for (const cat of ['performance', 'accessibility', 'best-practices', 'seo']) {
      search.append('category', cat);
    }
    if (apiKey) search.set('key', apiKey);

    const res = await got(`${PSI_ENDPOINT}?${search.toString()}`, {
      timeout: { request: 90_000 },
      throwHttpErrors: false,
    }).json<PsiResponse>();

    const cats = res.lighthouseResult?.categories ?? {};
    const audits = res.lighthouseResult?.audits ?? {};

    return {
      performance: scoreOf(cats.performance),
      seo: scoreOf(cats.seo),
      accessibility: scoreOf(cats.accessibility),
      bestPractices: scoreOf(cats['best-practices']),
      lcpMs: numericOf(audits['largest-contentful-paint']),
      cls: numericOf(audits['cumulative-layout-shift']),
      inpMs: numericOf(audits['interaction-to-next-paint']) ?? numericOf(audits['interactive']),
      ttfbMs: numericOf(audits['server-response-time']),
    };
  } catch (e) {
    console.warn(`[pagespeed] failed for ${url}: ${(e as Error).message}`);
    return null;
  }
}

function scoreOf(cat?: { score: number | null }): number | null {
  if (!cat || cat.score == null) return null;
  return Math.round(cat.score * 100);
}

function numericOf(audit?: { numericValue?: number }): number | null {
  if (!audit || audit.numericValue == null) return null;
  return Math.round(audit.numericValue);
}
