import Anthropic from '@anthropic-ai/sdk';

export const MODEL_OPUS_4_7 = 'claude-opus-4-7';

let cachedClient: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (cachedClient) return cachedClient;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY not set in env. Add it to .env to run optimization.',
    );
  }
  cachedClient = new Anthropic();
  return cachedClient;
}
