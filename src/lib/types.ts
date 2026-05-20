export type Severity = 'critical' | 'important' | 'nice';

export interface PageData {
  url: string;
  status: number;
  html: string;
  fetchedAt: string;
  fetchMs: number;
}

export interface PageMeta {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  canonical: string | null;
  robots: string | null;
  viewport: string | null;
  h1s: string[];
  imagesTotal: number;
  imagesMissingAlt: number;
  internalLinks: number;
  externalLinks: number;
  jsonLdTypes: string[];
  ogTitle: string | null;
  ogImage: string | null;
  wordCount: number;
  isHttps: boolean;
}

export interface RuleResult {
  id: string;
  severity: Severity;
  passed: boolean;
  message: string;
  detail?: string;
}

export interface LighthouseResult {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  ttfbMs: number | null;
}

export interface PageAudit {
  url: string;
  status: number;
  fetchMs: number;
  meta: PageMeta | null;
  rules: RuleResult[];
  lighthouse?: LighthouseResult | null;
  error?: string;
}

export interface FixItem {
  severity: Severity;
  ruleId: string;
  issue: string;
  affectedUrls: string[];
}

export interface AuditReport {
  domain: string;
  generatedAt: string;
  pagesDiscovered: number;
  pagesCrawled: number;
  pagesFailed: number;
  counts: { critical: number; important: number; nice: number };
  pages: PageAudit[];
  topFixes: FixItem[];
}
