import got from 'got';

const BASE = 'https://api.dataforseo.com/v3';
const LOCATION_USA = 2840;
const LANGUAGE_EN = 'en';

export interface DfsConfig {
  login: string;
  password: string;
}

export interface SearchVolumeItem {
  keyword: string;
  search_volume: number | null;
  cpc: number | null;
  competition: number | null;
  competition_level: string | null;
}

export interface SerpOrganicItem {
  rank: number;
  url: string;
  title: string;
  domain: string;
  description: string | null;
}

export interface SerpResult {
  keyword: string;
  total_count: number | null;
  items: SerpOrganicItem[];
}

interface DfsResponse<T> {
  status_code: number;
  status_message: string;
  cost: number;
  tasks: Array<{
    status_code: number;
    status_message: string;
    cost: number;
    result: T[] | null;
  }>;
}

export class DataForSeoClient {
  private auth: string;
  public totalCostSpent = 0;

  constructor(cfg: DfsConfig) {
    this.auth = 'Basic ' + Buffer.from(`${cfg.login}:${cfg.password}`).toString('base64');
  }

  static fromEnv(): DataForSeoClient {
    const login = process.env.DATAFORSEO_LOGIN;
    const password = process.env.DATAFORSEO_PASSWORD;
    if (!login || !password) {
      throw new Error('DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set in env');
    }
    return new DataForSeoClient({ login, password });
  }

  private checkResponse<T>(path: string, res: DfsResponse<T>): void {
    if (res.status_code !== 20000) {
      throw new Error(
        `DataForSEO ${path} failed: ${res.status_code} ${res.status_message}`,
      );
    }
    const task = res.tasks?.[0];
    if (task && task.status_code !== 20000) {
      throw new Error(
        `DataForSEO ${path} task failed: ${task.status_code} ${task.status_message}`,
      );
    }
  }

  private async post<T>(path: string, body: unknown): Promise<DfsResponse<T>> {
    const res = await got.post(`${BASE}${path}`, {
      headers: { authorization: this.auth, 'content-type': 'application/json' },
      json: body,
      timeout: { request: 60_000 },
      throwHttpErrors: false,
    }).json<DfsResponse<T>>();
    if (typeof res.cost === 'number') this.totalCostSpent += res.cost;
    this.checkResponse(path, res);
    return res;
  }

  private async get<T>(path: string): Promise<DfsResponse<T>> {
    const res = await got(`${BASE}${path}`, {
      headers: { authorization: this.auth },
      timeout: { request: 30_000 },
      throwHttpErrors: false,
    }).json<DfsResponse<T>>();
    if (typeof res.cost === 'number') this.totalCostSpent += res.cost;
    this.checkResponse(path, res);
    return res;
  }

  async balance(): Promise<{ login: string; balance: number }> {
    const r = await this.get<{ login: string; money?: { balance?: number } }>(
      '/appendix/user_data',
    );
    const result = r.tasks?.[0]?.result?.[0];
    return {
      login: result?.login ?? 'unknown',
      balance: result?.money?.balance ?? 0,
    };
  }

  /** Google Ads search volume — batches up to 1000 keywords per call. */
  async searchVolume(keywords: string[], location = LOCATION_USA, language = LANGUAGE_EN): Promise<SearchVolumeItem[]> {
    if (keywords.length === 0) return [];
    const r = await this.post<SearchVolumeItem>(
      '/keywords_data/google_ads/search_volume/live',
      [{ keywords, location_code: location, language_code: language }],
    );
    const items = r.tasks?.[0]?.result ?? [];
    return items.map((it) => ({
      keyword: it.keyword,
      search_volume: it.search_volume ?? null,
      cpc: it.cpc ?? null,
      competition: it.competition ?? null,
      competition_level: it.competition_level ?? null,
    }));
  }

  /** Top 10 organic SERP results for one keyword. */
  async serpOrganic(keyword: string, location = LOCATION_USA, language = LANGUAGE_EN): Promise<SerpResult> {
    const r = await this.post<{
      keyword: string;
      se_results_count: number | null;
      items: Array<{
        type: string;
        rank_absolute: number;
        rank_group: number;
        url?: string;
        title?: string;
        domain?: string;
        description?: string;
      }>;
    }>(
      '/serp/google/organic/live/regular',
      [{ keyword, location_code: location, language_code: language, depth: 10 }],
    );
    const result = r.tasks?.[0]?.result?.[0];
    const organicItems: SerpOrganicItem[] = (result?.items ?? [])
      .filter((it) => it.type === 'organic' && it.url)
      .slice(0, 10)
      .map((it) => ({
        rank: it.rank_group ?? it.rank_absolute,
        url: it.url!,
        title: it.title ?? '',
        domain: it.domain ?? new URL(it.url!).host,
        description: it.description ?? null,
      }));
    return {
      keyword,
      total_count: result?.se_results_count ?? null,
      items: organicItems,
    };
  }
}
