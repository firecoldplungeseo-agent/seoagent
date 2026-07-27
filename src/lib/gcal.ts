import got from 'got';

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/** Marker written into every hold this agent creates, so reruns can find their own work. */
export const GUARD_FLAG = 'calguard';
/** Property holding the source event id a hold was mirrored from. */
export const GUARD_KEY = 'calguardKey';

export interface GcalConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GcalDateTime {
  dateTime?: string;
  date?: string;
  timeZone?: string;
}

export interface GcalAttendee {
  email?: string;
  responseStatus?: string;
  self?: boolean;
  optional?: boolean;
}

export interface GcalEvent {
  id: string;
  iCalUID?: string;
  status?: string;
  summary?: string;
  description?: string;
  start?: GcalDateTime;
  end?: GcalDateTime;
  transparency?: 'opaque' | 'transparent';
  eventType?: string;
  organizer?: { email?: string; self?: boolean };
  creator?: { email?: string; self?: boolean };
  attendees?: GcalAttendee[];
  recurringEventId?: string;
  visibility?: string;
  reminders?: { useDefault: boolean; overrides?: Array<{ method: string; minutes: number }> };
  extendedProperties?: { private?: Record<string, string>; shared?: Record<string, string> };
}

export interface CalendarListEntry {
  id: string;
  summary?: string;
  accessRole?: string;
  timeZone?: string;
}

/**
 * Minimal Google Calendar REST client. Uses an OAuth refresh token rather than a
 * service account, because the calendars live in a Workspace the agent is a member
 * of rather than one it owns.
 *
 * Requires the https://www.googleapis.com/auth/calendar scope — the GSC_* refresh
 * token will not work here, its grant does not include Calendar.
 */
export class GcalClient {
  private cfg: GcalConfig;
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(cfg: GcalConfig) {
    this.cfg = cfg;
  }

  static fromEnv(): GcalClient {
    const clientId = process.env.GCAL_CLIENT_ID;
    const clientSecret = process.env.GCAL_CLIENT_SECRET;
    const refreshToken = process.env.GCAL_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error(
        'GCAL_CLIENT_ID, GCAL_CLIENT_SECRET and GCAL_REFRESH_TOKEN must be set in env. ' +
          'The token needs the https://www.googleapis.com/auth/calendar scope.',
      );
    }
    return new GcalClient({ clientId, clientSecret, refreshToken });
  }

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 60_000) return this.accessToken;
    const res = await got
      .post(TOKEN_ENDPOINT, {
        form: {
          client_id: this.cfg.clientId,
          client_secret: this.cfg.clientSecret,
          refresh_token: this.cfg.refreshToken,
          grant_type: 'refresh_token',
        },
        timeout: { request: 30_000 },
      })
      .json<{ access_token: string; expires_in: number }>();
    this.accessToken = res.access_token;
    this.expiresAt = Date.now() + res.expires_in * 1000;
    return this.accessToken;
  }

  private async call<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    opts: { search?: Record<string, string>; body?: unknown } = {},
  ): Promise<T> {
    const token = await this.token();
    const url = `${CAL_BASE}${path}`;
    const res = await got(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      searchParams: opts.search,
      json: opts.body === undefined ? undefined : opts.body,
      timeout: { request: 45_000 },
      responseType: 'text',
      throwHttpErrors: false,
      retry: { limit: 2, methods: ['GET', 'PATCH', 'DELETE', 'POST'] },
    });
    if (res.statusCode >= 400) {
      throw new GcalError(res.statusCode, `${method} ${path} -> ${res.statusCode}: ${res.body}`);
    }
    return (res.body ? JSON.parse(res.body) : {}) as T;
  }

  async listCalendars(): Promise<CalendarListEntry[]> {
    const out: CalendarListEntry[] = [];
    let pageToken: string | undefined;
    do {
      const search: Record<string, string> = { maxResults: '250' };
      if (pageToken) search.pageToken = pageToken;
      const res = await this.call<{ items?: CalendarListEntry[]; nextPageToken?: string }>(
        'GET',
        '/users/me/calendarList',
        { search },
      );
      out.push(...(res.items ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  /** Recurring events are expanded into instances, so each hold maps to one real slot. */
  async listEvents(calendarId: string, timeMin: string, timeMax: string): Promise<GcalEvent[]> {
    const out: GcalEvent[] = [];
    let pageToken: string | undefined;
    do {
      const search: Record<string, string> = {
        timeMin,
        timeMax,
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '2500',
        showDeleted: 'false',
      };
      if (pageToken) search.pageToken = pageToken;
      const res = await this.call<{ items?: GcalEvent[]; nextPageToken?: string }>(
        'GET',
        `/calendars/${encodeURIComponent(calendarId)}/events`,
        { search },
      );
      out.push(...(res.items ?? []));
      pageToken = res.nextPageToken;
    } while (pageToken);
    return out;
  }

  async insertEvent(calendarId: string, body: Partial<GcalEvent>): Promise<GcalEvent> {
    return this.call<GcalEvent>('POST', `/calendars/${encodeURIComponent(calendarId)}/events`, {
      body,
      search: { sendUpdates: 'none' },
    });
  }

  async patchEvent(
    calendarId: string,
    eventId: string,
    body: Partial<GcalEvent>,
  ): Promise<GcalEvent> {
    return this.call<GcalEvent>(
      'PATCH',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { body, search: { sendUpdates: 'none' } },
    );
  }

  async deleteEvent(calendarId: string, eventId: string): Promise<void> {
    await this.call<unknown>(
      'DELETE',
      `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { search: { sendUpdates: 'none' } },
    );
  }
}

export class GcalError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'GcalError';
  }
}
