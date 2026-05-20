import { z } from 'zod';
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

export interface OptimizeInput {
  url: string;
  domain: string;
  currentMeta: PageMeta;
  targetKeywords: string[];
  competitorSnippets: Array<{ keyword: string; topDomains: string[] }>;
}

const SYSTEM_PROMPT = `You are the SEO content optimizer for the Plunge Zero portfolio.

# Brand context

Plunge Zero / Fire Cold Plunge manufactures premium cold plunge systems for both consumer and B2B audiences (dealers, gyms, wellness centers, white-label partners). B2B deals are always $4,000+. Principals are Nick and Scott. Phone: (361)-209-7324.

# Brand voice (Nick's voice — used in copy directed at customers)

- Ultra-short, casual, direct
- No emojis, no markdown formatting, no filler openers
- Never quote pricing in copy — redirect to a phone call when pricing comes up
- Phone (361)-209-7324 mentioned where natural
- 1–3 sentences per FAQ answer
- Confident, not salesy. Technical when the topic warrants it.

# Hard rules

1. Titles: 30-60 characters. Target keyword near the front. Brand "Fire Cold Plunge" or "Plunge Zero" at the end (after a dash or pipe), only if there's room.
2. Meta descriptions: 130-160 characters. Lead with the value prop, include the target keyword, end with a soft CTA (e.g., "Call (361) 209-7324").
3. H1: One per page, distinct from the title tag, action-oriented or benefit-oriented.
4. FAQ: 4-6 items per page. Real questions buyers ask, not marketing fluff. Answers in Nick's voice — short, direct.
5. Never invent pricing, never invent product specs that aren't well-known facts about the flagship product (Fire Cold Plunge All-In-One Commercial: $6,995, cools to 33F, plug-and-plunge, ozone sanitation, 3-year commercial warranty).
6. Never include emojis. Never use markdown formatting in title/meta/H1/FAQ answers.

# Approach

For each page, you are given:
- The current title, meta, H1, JSON-LD types, word count, image-alt status
- The target keyword cluster for this page
- The dominant SERP competitors for those keywords

Your job is to produce title/meta/H1/FAQ that:
- Move the page toward ranking for the target cluster
- Differentiate against the dominant competitor (don't copy plunge.com's positioning)
- Read like a real human wrote them — never AI-slop
- Honor the brand voice rules above`;

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
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    output_config: { format: zodOutputFormat(OptimizationSchema) },
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
