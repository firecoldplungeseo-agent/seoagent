#!/usr/bin/env node
/**
 * Preflight check for a fresh clone / new device.
 *
 *   npm run doctor          # offline: toolchain, files, env vars
 *   npm run doctor -- --live  # also hits DataForSEO, PSI, Anthropic, Gmail SMTP
 *
 * Never writes anything. Exit code 1 if any required check fails.
 */
import 'dotenv/config';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const LIVE = process.argv.includes('--live');
const ROOT = process.cwd();

type Status = 'ok' | 'warn' | 'fail';
const results: Array<{ status: Status; label: string; detail: string }> = [];

function record(status: Status, label: string, detail: string): void {
  const icon = status === 'ok' ? '✓' : status === 'warn' ? '!' : '✗';
  console.log(`  ${icon} ${label}${detail ? ` — ${detail}` : ''}`);
  results.push({ status, label, detail });
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Required vars, grouped by the command they unlock. */
const ENV_GROUPS: Array<{
  mode: string;
  vars: string[];
  required: boolean;
  note?: string;
}> = [
  {
    mode: 'seo-agent audit <domain>',
    vars: ['PAGESPEED_API_KEY'],
    required: false,
    note: 'audit runs without it, but PSI is heavily rate-limited unkeyed',
  },
  {
    mode: 'seo-agent keywords research | balance',
    vars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
    required: true,
  },
  {
    mode: 'seo-agent optimize <url>',
    vars: ['ANTHROPIC_API_KEY'],
    required: true,
  },
  {
    mode: 'seo-agent weekly',
    vars: ['DATAFORSEO_LOGIN', 'DATAFORSEO_PASSWORD'],
    required: true,
  },
  {
    mode: 'seo-agent weekly --send',
    vars: ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'DIGEST_RECIPIENTS'],
    required: false,
    note: 'only needed to email the digest instead of just writing it to digests/',
  },
];

function checkToolchain(): void {
  section('Toolchain');

  const major = Number(process.versions.node.split('.')[0]);
  if (major >= 20) {
    record('ok', `Node ${process.versions.node}`, 'ESM + got v14 need >= 20');
  } else {
    record('fail', `Node ${process.versions.node}`, 'need Node >= 20 (nvm install 22)');
  }

  if (existsSync(join(ROOT, 'node_modules', 'tsx'))) {
    record('ok', 'node_modules installed', '');
  } else {
    record('fail', 'node_modules missing', 'run: npm ci');
  }
}

function checkFiles(): void {
  section('Repo files');

  // .env is how a laptop supplies credentials. A remote container (Claude Code
  // on the web, phone or desktop) injects them as real environment variables
  // instead and has no .env at all — that's fine, so only fail when neither
  // source produced anything.
  const ALL_CRED_VARS = ENV_GROUPS.flatMap((g) => g.vars);
  const credsInEnv = ALL_CRED_VARS.filter((v) => process.env[v]);

  if (existsSync(join(ROOT, '.env'))) {
    record('ok', '.env present', '');
  } else if (credsInEnv.length > 0) {
    record('ok', 'no .env — credentials from environment', `${credsInEnv.length} var(s) set`);
  } else {
    record(
      'fail',
      'no credentials',
      'laptop: cp .env.example .env and fill it in · remote container: set them as environment variables',
    );
  }

  for (const seed of ['commercial', 'residential', 'beauty']) {
    const p = join(ROOT, 'keywords', 'seeds', `${seed}.txt`);
    if (existsSync(p)) record('ok', `keywords/seeds/${seed}.txt`, '');
    else record('warn', `keywords/seeds/${seed}.txt missing`, 'that cluster will fail');
  }

  const snapshots = existsSync(join(ROOT, 'state'));
  record(
    snapshots ? 'ok' : 'warn',
    'state/ directory',
    snapshots ? 'weekly can diff vs last snapshot' : 'first weekly run will have no baseline',
  );
}

function checkEnv(): void {
  section('Credentials (from .env)');

  for (const group of ENV_GROUPS) {
    const missing = group.vars.filter((v) => !process.env[v]);
    if (missing.length === 0) {
      record('ok', group.mode, group.vars.join(', '));
    } else if (group.required) {
      record('fail', group.mode, `missing ${missing.join(', ')}`);
    } else {
      record('warn', group.mode, `missing ${missing.join(', ')}${group.note ? ` (${group.note})` : ''}`);
    }
  }
}

/**
 * Can this machine actually reach what the modes need? Worth checking on its
 * own: a restrictive corporate proxy or a remote container's egress policy
 * blocks hosts regardless of whether the credentials are right, and the modes
 * only surface that as "0 pages crawled" or a timeout.
 */
async function checkEgress(): Promise<void> {
  section('Network egress');

  const got = (await import('got')).default;

  const hosts: Array<{ label: string; url: string; neededFor: string }> = [
    { label: 'firecoldplunge.com', url: 'https://firecoldplunge.com', neededFor: 'audit, optimize' },
    { label: 'plungezero.com', url: 'https://plungezero.com', neededFor: 'audit, optimize' },
    { label: 'faceplungecompany.com', url: 'https://faceplungecompany.com', neededFor: 'audit, optimize' },
    { label: 'api.dataforseo.com', url: 'https://api.dataforseo.com', neededFor: 'keywords, weekly' },
    { label: 'api.anthropic.com', url: 'https://api.anthropic.com', neededFor: 'optimize' },
    { label: 'googleapis.com (PSI)', url: 'https://www.googleapis.com', neededFor: 'audit lighthouse' },
  ];

  for (const h of hosts) {
    try {
      const res = await got(h.url, {
        method: 'HEAD',
        timeout: { request: 20_000 },
        throwHttpErrors: false,
        retry: { limit: 0 },
      });

      // A filtering proxy answers in place of the host, so a status code alone
      // doesn't prove reachability. Claude Code's egress proxy stamps
      // x-deny-reason on refusals; a bare 403/407 with no marker is ambiguous
      // (could be the proxy, could be the host's own WAF).
      const denyReason = res.headers['x-deny-reason'];
      if (denyReason) {
        record('fail', h.label, `blocked by egress policy (${denyReason}) — ${h.neededFor} will not work`);
      } else if (res.statusCode === 403 || res.statusCode === 407) {
        record('warn', h.label, `HTTP ${res.statusCode} — proxy refusal or host WAF; ${h.neededFor} may fail`);
      } else {
        record('ok', h.label, `reachable (HTTP ${res.statusCode}) — ${h.neededFor}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const proxyDenial = /CONNECT|tunnel|403|407/i.test(msg);
      record(
        'fail',
        h.label,
        proxyDenial
          ? `blocked by egress policy — ${h.neededFor} will not work`
          : `unreachable: ${msg} — ${h.neededFor}`,
      );
    }
  }

  // SMTP is a raw TCP connect, not HTTPS — proxies commonly block port 587
  // even when every HTTPS host above is allowed.
  const net = await import('node:net');
  const smtpOk = await new Promise<boolean>((resolve) => {
    const sock = net.connect({ host: 'smtp.gmail.com', port: 587 });
    const done = (ok: boolean) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(10_000);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
  if (smtpOk) {
    record('ok', 'smtp.gmail.com:587', 'reachable — weekly --send');
  } else {
    record('warn', 'smtp.gmail.com:587', 'blocked — weekly --send will fail; use the Gmail MCP or a laptop');
  }
}

async function checkLive(): Promise<void> {
  section('Live API checks');

  // DataForSEO — also prints remaining budget.
  if (process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD) {
    try {
      const { DataForSeoClient } = await import('./lib/dataforseo.js');
      const balance = await DataForSeoClient.fromEnv().balance();
      record('ok', 'DataForSEO auth', `$${balance.balance.toFixed(2)} remaining (${balance.login})`);
    } catch (err) {
      record('fail', 'DataForSEO auth', String(err instanceof Error ? err.message : err));
    }
  } else {
    record('warn', 'DataForSEO auth', 'skipped — credentials not set');
  }

  // PageSpeed Insights — cheap keyed request against a known-good URL.
  try {
    const got = (await import('got')).default;
    const search = new URLSearchParams({
      url: 'https://example.com',
      strategy: 'mobile',
      category: 'seo',
    });
    if (process.env.PAGESPEED_API_KEY) search.set('key', process.env.PAGESPEED_API_KEY);
    const res = await got(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${search.toString()}`,
      { timeout: { request: 90_000 }, throwHttpErrors: false },
    );
    const keyed = Boolean(process.env.PAGESPEED_API_KEY);
    if (res.statusCode === 200) {
      record('ok', 'PageSpeed Insights', keyed ? 'keyed' : 'unkeyed — works but rate-limited');
    } else if (res.statusCode === 429 && !keyed) {
      // Expected without a key: Google throttles anonymous PSI hard.
      record('warn', 'PageSpeed Insights', 'HTTP 429 unkeyed — set PAGESPEED_API_KEY');
    } else {
      record('fail', 'PageSpeed Insights', `HTTP ${res.statusCode}`);
    }
  } catch (err) {
    record('fail', 'PageSpeed Insights', String(err instanceof Error ? err.message : err));
  }

  // Anthropic — models.list() is free and validates the key.
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const Anthropic = (await import('@anthropic-ai/sdk')).default;
      await new Anthropic().models.list({ limit: 1 });
      record('ok', 'Anthropic API key', 'valid');
    } catch (err) {
      record('fail', 'Anthropic API key', String(err instanceof Error ? err.message : err));
    }
  } else {
    record('warn', 'Anthropic API key', 'skipped — not set');
  }

  // Gmail SMTP — verify() authenticates without sending mail.
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    try {
      const nodemailer = (await import('nodemailer')).default;
      await nodemailer
        .createTransport({
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
        })
        .verify();
      record('ok', 'Gmail SMTP', `${process.env.GMAIL_USER} authenticated`);
    } catch (err) {
      record('fail', 'Gmail SMTP', String(err instanceof Error ? err.message : err));
    }
  } else {
    record('warn', 'Gmail SMTP', 'skipped — GMAIL_USER / GMAIL_APP_PASSWORD not set');
  }
}

async function main(): Promise<void> {
  console.log(`seo-agent doctor${LIVE ? ' (live)' : ''} — ${ROOT}`);

  checkToolchain();
  checkFiles();
  checkEnv();
  if (LIVE) {
    await checkEgress();
    await checkLive();
  } else {
    console.log('\n(re-run with `npm run doctor -- --live` to test egress + the APIs)');
  }

  const fails = results.filter((r) => r.status === 'fail');
  const warns = results.filter((r) => r.status === 'warn');

  console.log(
    `\n${fails.length === 0 ? 'READY' : 'NOT READY'} — ` +
      `${results.length - fails.length - warns.length} ok, ${warns.length} warn, ${fails.length} fail`,
  );
  if (fails.length > 0) {
    console.log('Fix these first:');
    for (const f of fails) console.log(`  - ${f.label}: ${f.detail}`);
  }
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
