// promptfoo prompt function. Turns a fixture's ResearchContext into the exact
// system+user chat messages the server ships, by calling the REAL prompt builder
// — so the eval tests production behavior, not a copy that can drift.
//
// research.ts has no runtime imports (only a type-only import, erased at
// transpile), so promptfoo's esbuild loads it cleanly via the .ts specifier.
import { buildResearchPrompt } from '../server/src/prompts/research.ts';

interface PromptContext {
  vars: Record<string, unknown>;
}

export function briefPrompt(context: PromptContext) {
  // The fixture supplies a ResearchContext-shaped object under `context`.
  const ctx = context.vars.context as Parameters<typeof buildResearchPrompt>[0];
  const { system, user } = buildResearchPrompt(ctx);
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}
