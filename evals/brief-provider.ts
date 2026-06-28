// Custom promptfoo provider for AI research briefs.
//
// One entry point, env-driven, so `npm run eval:briefs` always runs locally:
//   - With XAI_API_KEY or OPENAI_API_KEY  → calls the real model (the true eval).
//   - With PROMPTFOO_MOCK=1 or no key     → replays recorded briefs (offline harness check).
//
// The deterministic assertions in the config run the same either way, so the
// source-honesty checks are exercised even without an API key.
import OpenAI from 'openai';
import { recordedBriefFor } from './recorded-briefs.ts';

interface ProviderOptions {
  id?: string;
  config?: Record<string, unknown>;
}

interface CallContext {
  vars?: Record<string, unknown>;
}

type ChatMessage = { role: string; content: string };

export default class BriefProvider {
  private providerId: string;

  constructor(options: ProviderOptions = {}) {
    this.providerId = options.id || 'research-brief';
  }

  id(): string {
    return this.providerId;
  }

  async callApi(prompt: string, context?: CallContext): Promise<{ output?: string; error?: string }> {
    let messages: ChatMessage[];
    try {
      messages = typeof prompt === 'string' ? JSON.parse(prompt) : (prompt as ChatMessage[]);
    } catch {
      return { error: `Could not parse prompt as chat messages: ${String(prompt).slice(0, 200)}` };
    }

    const xaiKey = process.env.XAI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const mock = process.env.PROMPTFOO_MOCK === '1' || (!xaiKey && !openaiKey);

    if (mock) {
      return { output: recordedBriefFor(context?.vars?.fixtureId) };
    }

    const client = xaiKey
      ? new OpenAI({ apiKey: xaiKey, baseURL: 'https://api.x.ai/v1' })
      : new OpenAI({ apiKey: openaiKey });
    const model = xaiKey ? 'grok-3-mini-fast' : 'gpt-4o-mini';

    try {
      const res = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      });
      return { output: res.choices?.[0]?.message?.content || '' };
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }
}
