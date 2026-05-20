import got from 'got';
import * as cheerio from 'cheerio';
import { parseStringPromise } from 'xml2js';
import pLimit from 'p-limit';
import type { PageData, PageMeta } from './types.js';

const USER_AGENT = 'plungezero-seo-agent/0.1 (+https://plungezero.com)';
const FETCH_TIMEOUT_MS = 20_000;

export async function discoverSitemaps(domain: string): Promise<string[]> {
  const base = normalizeDomain(domain);
  const candidates = new Set<string>();

  try {
    const robots = await got(`${base}/robots.txt`, {
      timeout: { request: 8_000 },
      headers: { 'user-agent': USER_AGENT },
      throwHttpErrors: false,
    }).text();
    for (const line of robots.split('\n')) {
      const m = line.match(/^\s*Sitemap:\s*(\S+)/i);
      if (m) candidates.add(m[1].trim());
    }
  } catch {
    // robots.txt unavailable — fall through to defaults
  }

  candidates.add(`${base}/sitemap.xml`);
  candidates.add(`${base}/sitemap_index.xml`);
  candidates.add(`${base}/sitemap-pages.xml`);

  const reachable: string[] = [];
  for (const url of candidates) {
    try {
      const res = await got.head(url, {
        timeout: { request: 5_000 },
        headers: { 'user-agent': USER_AGENT },
        throwHttpErrors: false,
      });
      if (res.statusCode >= 200 && res.statusCode < 400) reachable.push(url);
    } catch {
      // skip
    }
  }
  return reachable;
}

export async function expandSitemap(sitemapUrl: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  try {
    const xml = await got(sitemapUrl, {
      timeout: { request: 15_000 },
      headers: { 'user-agent': USER_AGENT },
    }).text();
    const parsed = await parseStringPromise(xml, { explicitArray: false, ignoreAttrs: true });

    if (parsed.sitemapindex?.sitemap) {
      const items = arr(parsed.sitemapindex.sitemap);
      const all: string[] = [];
      for (const it of items) {
        if (it.loc) {
          const subUrls = await expandSitemap(it.loc, depth + 1);
          all.push(...subUrls);
        }
      }
      return all;
    }

    if (parsed.urlset?.url) {
      return arr(parsed.urlset.url)
        .map((u: { loc?: string }) => u.loc)
        .filter((s: string | undefined): s is string => typeof s === 'string');
    }
  } catch (e) {
    console.warn(`[crawler] failed to expand sitemap ${sitemapUrl}: ${(e as Error).message}`);
  }
  return [];
}

export async function fetchPage(url: string): Promise<PageData> {
  const start = Date.now();
  const res = await got(url, {
    timeout: { request: FETCH_TIMEOUT_MS },
    headers: { 'user-agent': USER_AGENT },
    throwHttpErrors: false,
    followRedirect: true,
  });
  return {
    url: res.url || url,
    status: res.statusCode,
    html: res.body,
    fetchedAt: new Date().toISOString(),
    fetchMs: Date.now() - start,
  };
}

export function parsePage(page: PageData, domain: string): PageMeta {
  const $ = cheerio.load(page.html);
  const host = new URL(page.url).host;

  const title = $('title').first().text().trim() || null;
  const metaDescription = $('meta[name="description"]').attr('content')?.trim() || null;
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const robots = $('meta[name="robots"]').attr('content')?.trim() || null;
  const viewport = $('meta[name="viewport"]').attr('content')?.trim() || null;
  const ogTitle = $('meta[property="og:title"]').attr('content')?.trim() || null;
  const ogImage = $('meta[property="og:image"]').attr('content')?.trim() || null;

  const h1s: string[] = [];
  $('h1').each((_, el) => {
    const t = $(el).text().trim();
    if (t) h1s.push(t);
  });

  let imagesTotal = 0;
  let imagesMissingAlt = 0;
  $('img').each((_, el) => {
    imagesTotal++;
    const alt = $(el).attr('alt');
    if (alt == null || alt.trim() === '') imagesMissingAlt++;
  });

  let internalLinks = 0;
  let externalLinks = 0;
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    try {
      const u = new URL(href, page.url);
      if (u.host === host) internalLinks++;
      else externalLinks++;
    } catch {
      // skip malformed
    }
  });

  const jsonLdTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).contents().text());
      collectTypes(data, jsonLdTypes);
    } catch {
      // skip invalid JSON-LD
    }
  });

  const text = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = text ? text.split(' ').length : 0;

  return {
    title,
    titleLength: title?.length ?? 0,
    metaDescription,
    metaDescriptionLength: metaDescription?.length ?? 0,
    canonical,
    robots,
    viewport,
    h1s,
    imagesTotal,
    imagesMissingAlt,
    internalLinks,
    externalLinks,
    jsonLdTypes: [...new Set(jsonLdTypes)],
    ogTitle,
    ogImage,
    wordCount,
    isHttps: page.url.startsWith('https://'),
  };
}

function collectTypes(node: unknown, out: string[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, out);
    return;
  }
  if (typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    const t = obj['@type'];
    if (typeof t === 'string') out.push(t);
    else if (Array.isArray(t)) for (const ti of t) if (typeof ti === 'string') out.push(ti);
    if (obj['@graph']) collectTypes(obj['@graph'], out);
  }
}

function normalizeDomain(domain: string): string {
  let d = domain.trim().replace(/\/+$/, '');
  if (!d.startsWith('http://') && !d.startsWith('https://')) d = `https://${d}`;
  return d;
}

function arr<T>(v: T | T[]): T[] {
  return Array.isArray(v) ? v : [v];
}

export async function crawlPages(
  urls: string[],
  domain: string,
  concurrency = 5,
): Promise<Array<{ url: string; data: PageData | null; meta: PageMeta | null; error?: string }>> {
  const limit = pLimit(concurrency);
  return Promise.all(
    urls.map((url) =>
      limit(async () => {
        try {
          const data = await fetchPage(url);
          if (data.status >= 400) {
            return { url, data, meta: null, error: `HTTP ${data.status}` };
          }
          const meta = parsePage(data, domain);
          return { url, data, meta };
        } catch (e) {
          return { url, data: null, meta: null, error: (e as Error).message };
        }
      }),
    ),
  );
}
