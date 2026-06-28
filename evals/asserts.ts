// Deterministic assertion helpers for the brief eval.
//
// All pure functions of the model output — no LLM grader, so the whole suite runs
// with zero API keys (offline mock or live model alike). promptfoo calls these via
// `type: javascript, value: file://asserts.ts:fnName`.

/** Output is a real brief with a directional verdict, not an empty/refusal blob. */
export function looksLikeBrief(output: string): boolean {
  return output.trim().length > 60 && /verdict|lean (yes|no)|\bpass\b/i.test(output);
}

/**
 * Source honesty — no fabricated citations. None of the fixtures provide URLs, so
 * any link in the output is invented.
 */
export function noFabricatedUrls(output: string): boolean {
  return !/https?:\/\//i.test(output);
}

/**
 * Source honesty — the model must not claim it retrieved anything live when no
 * sources were handed to it (or at all).
 */
export function noLiveRetrievalClaim(output: string): boolean {
  return !/\b(i (just )?(searched|googled|looked up|browsed|scraped|crawled)|in real[ -]?time|live (web|news|internet)[ -]?search|according to (my|a|the) (web|news|recent)[ -]?search|i (found|pulled|retrieved) .*(online|on the web))\b/i.test(
    output
  );
}

/** Mentions trading fees / spread / round-trip cost (required when a gap is shown). */
export function mentionsFees(output: string): boolean {
  return /\bfees?\b|spread|round[- ]?trip|trading cost/i.test(output);
}

/** Mentions settlement rules/criteria. */
export function mentionsSettlement(output: string): boolean {
  return /settl/i.test(output);
}

/** Names the platforms or the cross-platform comparison. */
export function mentionsPlatformDiff(output: string): boolean {
  return /polymarket|kalshi|platform|cross[- ]?platform/i.test(output);
}

/** References Metaculus / superforecaster signal. */
export function mentionsMetaculus(output: string): boolean {
  return /metaculus|superforecaster/i.test(output);
}

/** Acknowledges thin/absent sourcing rather than bluffing. */
export function mentionsSourceLimits(output: string): boolean {
  return /base rate|limited|thin|sparse|no (recent )?(news|sources|external|coverage)|without (more )?(data|sources)/i.test(
    output
  );
}

/** Engages with the provided news/social context. */
export function engagesProvidedNews(output: string): boolean {
  return /sentiment|news|headline|report/i.test(output);
}

/** Reads the provided price trend/history. */
export function mentionsTrend(output: string): boolean {
  return /trend|history|price action|drift|recent move|momentum/i.test(output);
}
