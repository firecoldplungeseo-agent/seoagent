# New device setup

Getting `seo-agent` running on a fresh machine. Budget ~20 minutes, most of it
collecting credentials.

## 1. Toolchain

| Need | Version | Notes |
| --- | --- | --- |
| Node.js | >= 20 (22 recommended) | ESM-only project; `got` v14 requires 20+ |
| npm | ships with Node | |
| git | any | |
| Claude Code / Claude Desktop | current | only needed for the Shopify + Gmail MCP work |

```bash
# nvm is the easiest path
nvm install 22 && nvm use 22
node -v   # v22.x
```

## 2. Clone and install

```bash
git clone https://github.com/firecoldplungeseo-agent/seoagent.git
cd seoagent
npm run setup      # npm ci + creates .env from .env.example + runs doctor
```

`npm run setup` is idempotent — it never overwrites an existing `.env`.

## 3. Credentials

Fill in `.env`. Nothing is committed: `.env` is gitignored, and it is the only
place secrets belong.

| Var | Where to get it | Needed for |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys | `optimize` |
| `DATAFORSEO_LOGIN` / `DATAFORSEO_PASSWORD` | https://app.dataforseo.com/api-access | `keywords`, `weekly` |
| `PAGESPEED_API_KEY` | Google Cloud console → enable "PageSpeed Insights API" → create an API key | `audit` (optional but strongly recommended — unkeyed PSI 429s fast) |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` | `hello@firecoldplunge.com`, App Password at https://myaccount.google.com/apppasswords (needs 2FA on the account) | `weekly --send` |
| `DIGEST_RECIPIENTS` | comma-separated list | `weekly --send` |

The DataForSEO account carries a ~$50/mo budget cap. Check what's left before a
big run:

```bash
npm run dev -- keywords balance
```

### Not yet wired

`GSC_CLIENT_ID`, `GSC_CLIENT_SECRET`, `GSC_REFRESH_TOKEN`, `SEO_DOMAINS`, and
`DIGEST_EMAIL` are placeholders in `.env.example` — no code reads them today.
Leave them blank on a new device. Search Console access is documented as
`hello@firecoldplunge.com` (owns all three in-scope properties) for whenever the
GSC client gets built; the in-scope domain list currently lives in
`src/modes/weekly.ts`, not in env.

## 4. Verify

```bash
npm run doctor            # toolchain, files, which modes are unlocked
npm run doctor -- --live  # additionally authenticates DataForSEO, PSI, Anthropic, Gmail SMTP
npm run typecheck
```

`doctor` exits non-zero if anything required is missing and prints exactly what
to fix. `--live` spends nothing: the DataForSEO call is the free balance
endpoint, Anthropic is `models.list()`, and SMTP is `verify()` (authenticates
without sending).

Then a real smoke test — the cheapest useful command, no paid API involved:

```bash
npm run dev -- audit faceplungecompany.com --max-pages 10 --lighthouse none
# writes reports/<domain>-<date>.{md,json}
```

A healthy run discovers a sitemap and crawls several pages. If it reports
`Pages failed: 1` with an instant `HTTP 403`, the machine is behind a proxy or
network policy that blocks the customer domains — the CLI is fine, the egress
isn't.

## 5. MCP servers (Claude Desktop / Claude Code)

Shopify draft writes and Gmail digest delivery go through MCP, not through
tokens in `.env`. On a new device, sign in to Claude Desktop with the account
that holds the connectors and confirm:

- **Shopify** — three stores, one per domain (firecoldplunge, plungezero,
  faceplungecompany). Use `switch-shop` to move between them.
- **Gmail** — sending as `hello@firecoldplunge.com`.

Hard rule from `CLAUDE.md`: **Shopify writes are drafts/unpublished only.** The
CLI itself never writes to Shopify — `optimize` produces markdown in
`optimizations/` for review.

The `.claude/` directory (25 skills, 18 agents) is checked in, so skills like
`/seo-audit` work as soon as the repo is cloned. Nothing to install.

## 6. What state must stay committed

`state/snapshot-*.json` and `digests/*.md` are **tracked on purpose** — `weekly`
diffs against the most recent snapshot to compute rank and audit deltas. On a
new device, `git pull` before running `weekly`, and commit the new snapshot after.
Generated `reports/`, `keywords/research/`, `optimizations/`, and
`competitors/*-auto-*` are gitignored.

## Commands

```bash
npm run dev -- audit <domain> [--max-pages 100] [--lighthouse none|homepage|top|all]
npm run dev -- keywords research [--cluster commercial|residential|beauty] [--skip-serp]
npm run dev -- keywords balance
npm run dev -- optimize <url> [--cluster commercial|residential|beauty]
npm run dev -- weekly [--skip-audit] [--send]
```

`npm run build` compiles to `dist/` and exposes the `seo-agent` bin if you'd
rather `npm link` it than use `npm run dev --`.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `ERR_MODULE_NOT_FOUND` on `./lib/x.js` | Node < 20, or running `node src/…` directly instead of `tsx` |
| PSI results all null | missing/invalid `PAGESPEED_API_KEY`, or 429 — re-run with `--lighthouse none` to confirm the rest works |
| `DataForSEO … 40200` / auth failure | wrong login (it's the account email, not a username) or the password isn't the API password from the API-access page |
| `weekly` reports every keyword as "entered" | no prior snapshot in `state/` — expected on a first run, or you forgot to `git pull` |
| Gmail SMTP `535` | using the account password instead of an App Password, or 2FA is off |
| `optimize` fails on cluster load | `keywords/seeds/<cluster>.txt` missing — `doctor` flags this |
