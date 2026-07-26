# seo-agent — Plunge Zero SEO automation

## Context

SEO agent for Plunge Zero's three customer-facing domains. Built on a fork of [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo) (skills + agents in `.claude/`) plus a Node.js/TS CLI in `src/`.

## Scope (locked 2026-05-20 after two clarification rounds)

### firecoldplunge.com — LIMITED scope
Only these page types are in SEO scope:
- Homepage
- Product page: **Fire Cold Plunge All-in-One Residential** (`/products/the-fire-cold-plunge-tub`)
- Product page: **Fire Cold Plunge All-in-One Commercial** (`/products/fire-cold-plunge-all-in-one-commercial`, $6,995)
- Blog content

**Out of scope on firecoldplunge.com:** all other product pages (e.g., leaf-skimmer, outdoor-plunge-cover, child-safety-lock, surebright-warranty, white-label-only NOINDEX'd pages, accessories, etc.). Do not optimize, do not flag in audits as priority.

### plungezero.com — FULL scope
All pages in SEO scope. **Known architectural problem:** site renders client-side without sitemap; bots see no content. This is the top priority blocker — SEO work here has zero leverage until the site is crawlable. Investigate and recommend a fix path (SSR/static prerender/Shopify theme audit).

### faceplungecompany.com — FULL scope
All pages in SEO scope. Beauty / ice-facial keyword cluster (`keywords/seeds/beauty.txt`) is active.

### Other domains — out of scope entirely
plungecenter, dfycoldplunge, doneforyouplunge, getcoldplunge, thefirecoldplunge, saunaheatersupply. Don't touch.

## Brand voice (Nick's voice, signed "Nick")

- Ultra-short, casual, direct
- No emojis, no markdown formatting, no filler openers
- Phone (361)-209-7324 mentioned where natural
- Never quote pricing in email/copy — redirect to phone for B2B
- 1–3 sentences for reply tone (applies to FAQ answers, support content)

## Hard rules

1. **Drafts only — never auto-publish.** Any Shopify writes go to draft/unpublished. User reviews before publish.
2. **State is explicit.** No hidden runtime state. Persist to local JSON in `state/` or to Shopify/HubSpot custom properties.
3. **Idempotent.** Re-running any mode should not duplicate work or push duplicate drafts.
4. **GSC OAuth uses `hello@firecoldplunge.com`** — owns Search Console for all three in-scope domains.
5. **Respect intentional NOINDEX on firecoldplunge.com.** White-label-gated product pages are out of scope.
6. **For firecoldplunge.com, filter the audit/optimizer to in-scope URLs only.** Don't run optimization on out-of-scope product pages even if the audit catches them.

## Modes

- `seo-agent audit <domain>` — Phase 1, on-demand full audit ✅ working
- `seo-agent keywords research` — Phase 2, keyword + competitor research ✅ working
- `seo-agent optimize <url>` — Phase 3, content optimizer (writes Shopify draft) ⏸ not built
- `seo-agent weekly` — Phase 4, scheduled cron + digest to scott@plungezero.com ⏸ not built
- `seo-agent calguard` — cross-calendar busy mirroring, stops Calendly/HubSpot double-booking Nick ✅ built, ⏸ needs `GCAL_*` OAuth token. Dry-run by default; `--apply` writes. See `docs/calendar-double-booking.md`.

## Stack

- Node.js / TypeScript, ESM
- Anthropic Sonnet 4.6 for content drafting
- DataForSEO (rank + backlinks + on-page Lighthouse) — ~$50/mo budget cap
- Google PageSpeed Insights API (free tier)
- Google Search Console API (OAuth via hello@firecoldplunge.com)
- Shopify MCP (Claude Desktop) — draft writes (3 stores, one per domain)
- Gmail MCP — digest delivery

## Keyword clusters

- **Commercial** (`keywords/seeds/commercial.txt`) — for firecoldplunge.com Commercial product page. 35 seeds. Active.
- **Residential / Consumer** — for firecoldplunge.com Residential product + homepage. TBD — needs to be added.
- **Beauty** (`keywords/seeds/beauty.txt`) — for faceplungecompany.com. 25 seeds. Active.
- **plungezero.com cluster** — TBD once architectural fix path is known.

## Competitor seed (auto-detected from SERPs 2026-05-20)

- **Commercial:** plunge.com (dominant, 22/35), thecoldplungestore.com, coldplungeguys.com, polarmonkeys.com, chillygoattubs.com, coldtub.com, business.plunge.com.
- **Beauty:** Healthline (17), Instagram (13), Amazon (12), Vogue (10). Direct product rivals: contourcube.com, facedunk.com, skingymco.com.

## Open TODOs

- Add `keywords/seeds/residential.txt` consumer cluster (~25 keywords like "cold plunge tub", "home cold plunge", "ice bath tub for home")
- Investigate plungezero.com rendering architecture — is it Shopify? What's blocking crawl?
- Build Phase 3 content optimizer
