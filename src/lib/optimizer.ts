import { z } from 'zod/v4';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAnthropicClient, MODEL_OPUS_4_7 } from './anthropic.js';
import type { PageMeta } from './types.js';

export const OptimizationSchema = z.object({
  title: z
    .string()
    .max(60)
    .describe('Optimized page title, 30-60 chars, target keyword near the front, brand at end'),
  meta_description: z
    .string()
    .max(160)
    .describe('Compelling meta description, 130-160 chars, includes target keyword and a soft call-to-action like a phone CTA where appropriate'),
  h1: z
    .string()
    .describe('Optimized H1, action-oriented, includes primary keyword, distinct from title tag'),
  faq_items: z
    .array(
      z.object({
        question: z.string().describe('FAQ question matching real search intent'),
        answer: z
          .string()
          .describe("Concise answer in Nick's brand voice: ultra-short, direct, no fluff, redirects to phone for pricing"),
      }),
    )
    .min(4)
    .max(6)
    .describe('FAQ items for FAQ JSON-LD schema. Cover buying objections, technical questions, and B2B-specific concerns.'),
  target_keywords_used: z
    .array(z.string())
    .describe('Which target keywords from the cluster are now woven into title/meta/H1/FAQ'),
  optimization_rationale: z
    .string()
    .max(800)
    .describe('Short rationale: what changed, why, and which keyword opportunities this addresses'),
  recommended_internal_links: z
    .array(
      z.object({
        anchor_text: z.string(),
        target_path: z.string().describe('Relative path like /products/the-fire-cold-plunge-tub or /pages/about'),
        reason: z.string().max(120),
      }),
    )
    .max(8)
    .describe('Internal links to add to this page to strengthen topic clusters'),
});

export type Optimization = z.infer<typeof OptimizationSchema>;

export type OptimizerCluster = 'commercial' | 'residential' | 'beauty';

export interface OptimizeInput {
  url: string;
  domain: string;
  cluster: OptimizerCluster;
  currentMeta: PageMeta;
  targetKeywords: string[];
  competitorSnippets: Array<{ keyword: string; topDomains: string[] }>;
}

const BASE_SYSTEM_PROMPT = `You are the SEO content optimizer for the Plunge Zero portfolio.

# Brand context

Plunge Zero / Fire Cold Plunge manufactures premium cold plunge systems plus a separate consumer beauty product line (Face Plunge Company — Arauris Face Plunge ice facial bowl). Principals are Nick and Scott. Phone: (361)-209-7324.

# Brand voice (Nick's voice — used across all copy)

- Ultra-short, casual, direct
- No emojis, no markdown formatting, no filler openers
- 1–3 sentences per FAQ answer
- Confident, not salesy. Technical when the topic warrants it.

# Universal hard rules

1. Titles: 30-60 characters. Target keyword near the front. Brand at the end (after a dash or pipe), only if there's room.
2. Meta descriptions: 130-160 characters. Lead with the value prop, include the target keyword, end with a CTA appropriate for the cluster (see cluster-specific rules below).
3. H1: One per page, distinct from the title tag, action-oriented or benefit-oriented.
4. FAQ: 4-6 items per page. Real questions buyers ask, not marketing fluff.
5. Never include emojis. Never use markdown formatting in title/meta/H1/FAQ answers.
6. Never invent product specs. Known flagship facts: Fire Cold Plunge All-In-One Commercial cools to 33F, plug-and-plunge, ozone sanitation, 3-year commercial warranty. Arauris Face Plunge is a patented dual-chamber facial cold plunge bowl with a separate ice chamber so ice never touches skin.

# Internal-link recommendations

Only recommend links to pages you are confident exist:
- The homepage (\`/\`)
- Standard Shopify pages (\`/pages/contact\`, \`/pages/about\`, \`/collections/all\`)
- Pages or products you can see clearly referenced in the audit data

Do NOT invent paths like \`/pages/wholesale\`, \`/pages/dealers\`, \`/pages/financing\`, or any vertical-specific landing page (\`/pages/gym-cold-plunge\`, etc.) unless you can see it actually exists. If you're unsure, omit the recommendation — an empty list is fine.

# Approach

For each page, you are given:
- The current title, meta, H1, JSON-LD types, word count, image-alt status
- The target keyword cluster + cluster-specific rules
- The dominant SERP competitors for those keywords

Your job is to produce title/meta/H1/FAQ that:
- Move the page toward ranking for the target cluster
- Differentiate against the dominant competitor
- Read like a real human wrote them — never AI-slop
- Honor the brand voice and cluster-specific rules`;

const CLUSTER_RULES: Record<OptimizerCluster, string> = {
  commercial: `# Cluster: commercial (B2B — gyms, dealers, spas, wellness centers)

- Buyers: facility operators, dealers, white-label partners. Deals are $4K+.
- Phone CTA is mandatory in the meta description ("Call (361) 209-7324").
- Never quote pricing — redirect to phone for pricing questions in FAQ.
- Tone: operator-focused, ROI-aware, durability/uptime-aware. Not lifestyle.
- Speak to specific verticals: gyms, CrossFit boxes, chiropractic, PT, hotels, spas.`,
  residential: `# Cluster: residential (consumer cold plunge for home — high-consideration $4-7K buy)

- Buyers: home consumers buying for personal recovery use.
- Phone CTA is encouraged in the meta description — buyers at this price point often call with questions before purchasing.
- Pricing CAN be referenced in soft language (e.g. "starting at" or "premium" framing) but exact prices belong on the product page itself, not in meta tags.
- Tone: home recovery, daily use, indoor/outdoor, durability for personal use.`,
  beauty: `# Cluster: beauty (consumer e-commerce — Face Plunge / ice facial bowl, sub-$100)

- Buyers: skincare/beauty consumers making an impulse-to-low-consideration purchase.
- DO NOT include a phone CTA in the meta description. Phone calls are wrong for this category — buyers expect to add-to-cart online.
- Use online-shopping ending in meta: a value prop, social proof reference ("180+ 5-star reviews"), free-shipping mention, or just a strong closing benefit. Never "Call (361) 209-7324".
- Pricing can be mentioned naturally (e.g. "$49 ice facial bowl") — this is normal consumer e-commerce, not B2B.
- Tone: skincare-friendly but still direct. Wake-up-your-skin, depuff, glow language is fine. No fluff.
- FAQ: real questions like "How long do I plunge?", "Can I use ice cubes from the freezer?", "Does it work for sensitive skin?", "How is this different from a regular bowl of ice?" — not B2B questions.`,
};

function buildSystemPrompt(cluster: OptimizerCluster): string {
  return `${BASE_SYSTEM_PROMPT}\n\n${CLUSTER_RULES[cluster]}`;
}

export async function optimizePage(input: OptimizeInput): Promise<Optimization> {
  const client = getAnthropicClient();

  const userPrompt = buildUserPrompt(input);

  const response = await client.messages.parse({
    model: MODEL_OPUS_4_7,
    max_tokens: 8000,
    thinking: { type: 'adaptive', display: 'summarized' },
    system: [
      {
        type: 'text',
        text: buildSystemPrompt(input.cluster),
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: { format: zodOutputFormat(OptimizationSchema as never) },
    messages: [{ role: 'user', content: userPrompt }],
  });

  if (!response.parsed_output) {
    throw new Error('Anthropic did not return parsed output for optimization');
  }
  return response.parsed_output;
}

function buildUserPrompt(input: OptimizeInput): string {
  const { url, currentMeta, targetKeywords, competitorSnippets } = input;
  const lines: string[] = [];
  lines.push(`# Page to optimize`);
  lines.push(``);
  lines.push(`URL: ${url}`);
  lines.push(``);
  lines.push(`## Current state`);
  lines.push(``);
  lines.push(`- Title: ${currentMeta.title ? `"${currentMeta.title}" (${currentMeta.titleLength} chars)` : 'MISSING'}`);
  lines.push(`- Meta description: ${currentMeta.metaDescription ? `"${currentMeta.metaDescription}" (${currentMeta.metaDescriptionLength} chars)` : 'MISSING'}`);
  lines.push(`- H1s: ${currentMeta.h1s.length === 0 ? 'MISSING' : currentMeta.h1s.map((h) => `"${h}"`).join(' | ')}`);
  lines.push(`- Canonical: ${currentMeta.canonical ?? 'MISSING'}`);
  lines.push(`- JSON-LD types present: ${currentMeta.jsonLdTypes.length === 0 ? 'NONE' : currentMeta.jsonLdTypes.join(', ')}`);
  lines.push(`- Word count: ${currentMeta.wordCount}`);
  lines.push(`- Internal links: ${currentMeta.internalLinks}`);
  lines.push(`- Images: ${currentMeta.imagesTotal} total, ${currentMeta.imagesMissingAlt} missing alt`);
  lines.push(``);
  lines.push(`## Target keyword cluster`);
  lines.push(``);
  for (const kw of targetKeywords) lines.push(`- ${kw}`);
  lines.push(``);
  if (competitorSnippets.length > 0) {
    lines.push(`## Dominant SERP competitors`);
    lines.push(``);
    for (const c of competitorSnippets) {
      lines.push(`- "${c.keyword}": ${c.topDomains.slice(0, 3).join(', ')}`);
    }
    lines.push(``);
  }
  lines.push(`Produce an optimized title, meta description, H1, 4–6 FAQ items, recommended internal links, and a short rationale. Honor every rule in the system prompt.`);
  return lines.join('\n');
}
