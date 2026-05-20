import type { PageMeta, RuleResult, LighthouseResult } from './types.js';

export function runRules(
  meta: PageMeta,
  url: string,
  lighthouse?: LighthouseResult | null,
): RuleResult[] {
  const results: RuleResult[] = [];

  results.push(
    meta.title
      ? pass('title-present', 'critical', 'Title tag present')
      : fail('title-present', 'critical', 'Missing title tag'),
  );

  if (meta.title) {
    if (meta.titleLength < 30) {
      results.push(fail('title-length', 'important', `Title is ${meta.titleLength} chars (target 30–60)`));
    } else if (meta.titleLength > 60) {
      results.push(fail('title-length', 'important', `Title is ${meta.titleLength} chars (target 30–60, may truncate in SERP)`));
    } else {
      results.push(pass('title-length', 'important', `Title length ${meta.titleLength} chars (good)`));
    }
  }

  results.push(
    meta.metaDescription
      ? pass('meta-desc-present', 'important', 'Meta description present')
      : fail('meta-desc-present', 'important', 'Missing meta description'),
  );

  if (meta.metaDescription) {
    if (meta.metaDescriptionLength < 70 || meta.metaDescriptionLength > 160) {
      results.push(
        fail(
          'meta-desc-length',
          'nice',
          `Meta description is ${meta.metaDescriptionLength} chars (target 70–160)`,
        ),
      );
    } else {
      results.push(pass('meta-desc-length', 'nice', `Meta description length OK`));
    }
  }

  if (meta.h1s.length === 0) {
    results.push(fail('h1-present', 'critical', 'No H1 tag found'));
  } else if (meta.h1s.length > 1) {
    results.push(
      fail('h1-unique', 'important', `Found ${meta.h1s.length} H1 tags (should be exactly 1)`, meta.h1s.slice(0, 3).join(' | ')),
    );
  } else {
    results.push(pass('h1-unique', 'important', `Single H1: "${meta.h1s[0].slice(0, 80)}"`));
  }

  if (meta.imagesTotal > 0) {
    const pct = ((meta.imagesTotal - meta.imagesMissingAlt) / meta.imagesTotal) * 100;
    if (meta.imagesMissingAlt > 0) {
      results.push(
        fail(
          'img-alt-coverage',
          pct < 50 ? 'critical' : 'important',
          `${meta.imagesMissingAlt}/${meta.imagesTotal} images missing alt text (${pct.toFixed(0)}% coverage)`,
        ),
      );
    } else {
      results.push(pass('img-alt-coverage', 'important', `All ${meta.imagesTotal} images have alt text`));
    }
  }

  results.push(
    meta.canonical
      ? pass('canonical-present', 'important', `Canonical: ${meta.canonical}`)
      : fail('canonical-present', 'important', 'Missing canonical link'),
  );

  results.push(
    meta.viewport
      ? pass('viewport-set', 'important', 'Viewport meta present')
      : fail('viewport-set', 'important', 'Missing viewport meta (mobile-unfriendly)'),
  );

  if (meta.robots && /noindex/i.test(meta.robots)) {
    results.push(fail('robots-indexable', 'critical', `robots meta contains noindex: "${meta.robots}"`));
  } else {
    results.push(pass('robots-indexable', 'critical', 'Page is indexable'));
  }

  if (meta.jsonLdTypes.length === 0) {
    results.push(fail('jsonld-present', 'important', 'No JSON-LD structured data found'));
  } else {
    results.push(
      pass('jsonld-present', 'important', `JSON-LD types: ${meta.jsonLdTypes.join(', ')}`),
    );
  }

  if (meta.internalLinks < 3) {
    results.push(
      fail('internal-links', 'important', `Only ${meta.internalLinks} internal links (orphan-page risk)`),
    );
  } else {
    results.push(pass('internal-links', 'nice', `${meta.internalLinks} internal links`));
  }

  if (meta.wordCount < 200) {
    results.push(
      fail('thin-content', 'important', `Only ${meta.wordCount} words on page (thin content)`),
    );
  } else {
    results.push(pass('content-depth', 'nice', `${meta.wordCount} words`));
  }

  results.push(
    meta.isHttps
      ? pass('https', 'critical', 'Served over HTTPS')
      : fail('https', 'critical', 'NOT served over HTTPS'),
  );

  if (lighthouse) {
    if (lighthouse.performance != null) {
      const sev: 'critical' | 'important' | 'nice' = lighthouse.performance < 50 ? 'critical' : lighthouse.performance < 80 ? 'important' : 'nice';
      results.push(
        lighthouse.performance >= 80
          ? pass('lh-performance', sev, `Lighthouse perf ${lighthouse.performance}`)
          : fail('lh-performance', sev, `Lighthouse perf ${lighthouse.performance} (target 80+)`),
      );
    }
    if (lighthouse.seo != null) {
      results.push(
        lighthouse.seo >= 90
          ? pass('lh-seo', 'important', `Lighthouse SEO ${lighthouse.seo}`)
          : fail('lh-seo', 'important', `Lighthouse SEO ${lighthouse.seo} (target 90+)`),
      );
    }
    if (lighthouse.lcpMs != null && lighthouse.lcpMs > 2500) {
      results.push(fail('cwv-lcp', 'important', `LCP ${lighthouse.lcpMs}ms (target ≤2500ms)`));
    }
    if (lighthouse.cls != null && lighthouse.cls > 0.1) {
      results.push(fail('cwv-cls', 'important', `CLS ${lighthouse.cls.toFixed(3)} (target ≤0.1)`));
    }
  }

  return results;
}

function pass(id: string, severity: RuleResult['severity'], message: string): RuleResult {
  return { id, severity, passed: true, message };
}

function fail(id: string, severity: RuleResult['severity'], message: string, detail?: string): RuleResult {
  return { id, severity, passed: false, message, detail };
}
