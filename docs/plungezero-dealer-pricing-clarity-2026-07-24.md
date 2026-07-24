# plungezero.com /dealer-program — pricing & bulk-tier clarity fix

**Date:** 2026-07-24
**Trigger:** Dealer prospect passed, saying "we can't meet the 18-unit minimum." There is no program-wide minimum — the 18-unit MOQ only applies to the optional bulk tier. The page's wording and visual hierarchy caused the misread.

## Where the page lives

- Lovable project: **Visionary Build** (`remember-plan-web`, project id `36e4650c-217c-4ff2-862f-7984e23c9e12`)
- File: `src/pages/DealerProgram.tsx`
- Content is **hardcoded in the React component** (the `pricingRows` array + JSX). Supabase is not involved in this page's copy.
- Changes made in Lovable go to the preview; the live site only updates on publish.

## Root causes of the misread

1. **Wrong number highlighted.** In both the mobile cards and desktop table, the bulk cost ($2,995 / $3,495) is rendered in the cyan accent (`text-primary font-semibold`) while the actual entry price (dealer cost) is plain. The eye lands on the highlighted price and the "18-unit MOQ" sub-label directly under it, and reads them as one unit: "the price requires 18 units."
2. **Subheading leads with the restriction.** "MAP-protected pricing · bulk tier requires an 18-unit MOQ" is the first line of the pricing card. 18 is the only quantity mentioned anywhere on the page, so it reads as the program's entry requirement.
3. **Hero stat is the volume-gated number.** The first hero card is "50% — Max margin at volume." The headline stat is the conditional one, and "at volume" resolves to "18-unit MOQ" when the reader scrolls down.
4. **Missing sentence.** Nothing on the page says "no minimum order." The reader has to infer it, and the hierarchy pushes the inference the wrong way.

## Change spec (copy + styling only; no price changes, no redesign)

### 1. Hero stat cards (reorder + reword)
| # | Value | Label |
|---|-------|-------|
| 1 | $2K–3K | Profit per unit sold |
| 2 | Up to 50% | Margin with optional bulk tier |
| 3 | 1 | Dealer per territory |

### 2. Pricing card subheading
> MAP-protected pricing · no minimum order · optional bulk tier for deeper savings

### 3. Swap visual emphasis (mobile cards + desktop table)
- **Dealer Cost**: becomes the highlighted value (`text-primary font-semibold`), with sub-label "No minimum order" (same tiny muted style used today for "18-unit MOQ").
- **Bulk Cost**: label becomes "Bulk Cost (Optional)", value drops to default styling, sub-label becomes "Optional · 18-unit container orders".

### 4. Footer paragraph under the pricing table
> Pricing is held by an enforced MAP — no race to the bottom, margins protected across the channel. Standard dealer pricing has no minimum order and earns $2,000 profit per unit. Dealers who choose the optional 18-unit bulk tier unlock $3,000 per unit.

### 5. Desktop table column header
"Max Margin" → "Margin (up to)"

## Ready-to-paste Lovable prompt

```
In src/pages/DealerProgram.tsx, we're getting real dealer prospects misreading the pricing section — they think the 18-unit MOQ applies to the whole program and are walking away. The 18-unit minimum ONLY applies to the optional bulk tier; standard dealer pricing has no minimum order. Make these precise copy/styling changes (do not redesign the page, do not change any prices):

1. HERO STAT CARDS (the three frosted-glass cards): reorder and reword to:
   - Card 1: value "$2K–3K", label "Profit per unit sold"
   - Card 2: value "Up to 50%", label "Margin with optional bulk tier"
   - Card 3: value "1", label "Dealer per territory" (unchanged)

2. PRICING CARD SUBHEADING: change "MAP-protected pricing · bulk tier requires an 18-unit MOQ" to "MAP-protected pricing · no minimum order · optional bulk tier for deeper savings"

3. SWAP THE VISUAL EMPHASIS in both the mobile stacked cards and the desktop table:
   - Dealer Cost value: make it the highlighted one (text-primary font-semibold) and add a small sub-label under it reading "No minimum order" (same tiny muted style currently used for "18-unit MOQ")
   - Bulk Cost: rename the label to "Bulk Cost (Optional)", render the value in default/plain styling (remove text-primary), and change its sub-label from "18-unit MOQ" to "Optional · 18-unit container orders"

4. FOOTER PARAGRAPH under the pricing table: replace with: "Pricing is held by an enforced MAP — no race to the bottom, margins protected across the channel. Standard dealer pricing has no minimum order and earns $2,000 profit per unit. Dealers who choose the optional 18-unit bulk tier unlock $3,000 per unit."

5. DESKTOP TABLE "Max Margin" column header: rename to "Margin (up to)".

Keep everything else on the page exactly as is.
```

## Framing note

The bulk tier is a selling point — "margin grows to 50% as you scale" is a strong story. The fix is sequencing, not burying: entry terms first and loudest, upgrade path second and clearly labeled optional.
