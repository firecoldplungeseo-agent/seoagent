# seo-agent — Plunge Zero SEO automation

## Context

SEO agent for the Plunge Zero portfolio. Built on a fork of [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) (skills + agents in `.claude/`) plus a Node.js/TS CLI in `src/`.

## v1 scope — 3 priority domains

| Domain | Platform | Audience | Keyword cluster |
|---|---|---|---|
| firecoldplunge.com | Shopify | Consumer + B2B | Commercial cold plunge |
| plungezero.com | Shopify | B2B (dealers, gyms, wellness centers) | Commercial cold plunge |
| faceplungecompany.com | Shopify | Beauty / skincare consumers | Ice facial / cryo facial |

Other portfolio domains (plungecenter, dfycoldplunge, doneforyouplunge, getcoldplunge, thefirecoldplunge, saunaheatersupply) are Phase 5 cannibalization-analysis targets only — not v1 optimization targets.

## Brand voice (Nick's voice, signed "Nick")

- Ultra-short, casual, direct
- No emojis, no markdown formatting, no filler openers
- Phone (361)-209-7324 mentioned where natural
- Never quote pricing in email/copy — redirect to phone for B2B
- 1–3 sentences for outbound reply tone (applies to FAQ answers, support content)

## Hard rules

1. **Drafts only — never auto-publish.** Any Shopify writes go to draft/unpublished. User reviews before publish.
2. **State is explicit.** No hidden runtime state. Persist to local JSON in `state/` or to Shopify/HubSpot custom properties.
3. **Idempotent.** Re-running any mode should not duplicate work or push duplicate drafts.
4. **GSC OAuth uses `hello@firecoldplunge.com`** — the account that owns Search Console for all 3 v1 domains.

## Modes

- `seo-agent audit <domain>` — Phase 1, on-demand full audit
- `seo-agent optimize <url>` — Phase 3, content optimizer (writes Shopify draft)
- `seo-agent weekly` — Phase 4, scheduled cron (rank delta + competitor scan + digest to scott@plungezero.com)
- `seo-agent cannibalize` — Phase 5, portfolio-wide overlap analysis

## Stack

- Node.js / TypeScript, ESM
- Anthropic Sonnet 4.6 for content drafting
- DataForSEO (rank + backlinks + on-page Lighthouse) — ~$50/mo budget cap
- Google PageSpeed Insights API (free tier)
- Google Search Console API (OAuth via hello@firecoldplunge.com)
- Shopify MCP (Claude Desktop) — draft writes
- Gmail MCP — digest delivery

## Competitor seed

Commercial: business.plunge.com, coldtub.com, chillygoattubs.com, icebarrel.com.
Beauty/face plunge: TBD from user.
