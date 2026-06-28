// Recorded brief outputs for offline / mock mode.
//
// When no API key is present (or PROMPTFOO_MOCK=1), the custom provider replays
// these instead of calling a model, so `npm run eval:briefs` runs locally with
// zero keys. They are hand-recorded examples of well-behaved output and exist to
// exercise the assertion harness end-to-end — the LIVE eval (with a key) is what
// grades the actual model.

const RECORDED: Record<string, string> = {
  'plain-no-sources': `**Verdict** — Pass · Fair value ~40% · Edge ~0pp · Conviction Low

**Thesis** — Short-horizon weather with no provided forecast data; nothing here beats the listed price.

**Drivers**
- Base-rate of next-day rain for the city/season
- No external news or social sources were retrieved for this market, so this is a base-rate read, not live coverage

**Bull / Bear**
- Bull: unsettled pattern could push above the market's implied odds
- Bear: short window limits surprise

**Catalysts** — The next forecast update before close.`,

  'cross-platform-arb': `**Verdict** — Pass · Fair value ~30% · Edge ~0pp · Conviction Low

**Thesis** — The cross-platform price gap looks like an edge but does not survive costs.

**Drivers**
- Polymarket and Kalshi list this event with slightly different prices
- Settlement criteria differ between the two platforms, so the contracts are not identical
- Liquidity and timing differ

**Bull / Bear**
- Bull: if settlement rules truly matched, the gap would be worth pressing
- Bear: the spread is thin

**Signal read** — The cross-platform price gap is noise once you account for round-trip trading fees and settlement-rule differences between the two platforms.`,

  'metaculus-divergence': `**Verdict** — Lean YES · Fair value ~58% · Edge +8pp · Conviction Med

**Thesis** — Metaculus superforecasters sit well above the market, and their track record on this class of question is good.

**Drivers**
- Metaculus community prediction diverges from the market price by a double-digit margin
- Superforecaster calibration tends to beat thin markets

**Bull / Bear**
- Bull: the superforecaster signal is informed
- Bear: Metaculus can lag fast-moving news

**Signal read** — The superforecaster divergence looks like a real, if modest, edge rather than noise.`,

  'news-provided': `**Verdict** — Lean NO · Fair value ~35% · Edge -7pp · Conviction Med

**Thesis** — The provided headlines point away from the YES outcome.

**Drivers**
- The reported headlines describe setbacks for the YES case
- No countervailing catalyst before close

**Bull / Bear**
- Bull: a reversal is possible but unsupported by the provided context
- Bear: momentum is against YES

**Catalysts** — Any official announcement before close.

**Sentiment** — The provided news reads net-negative for YES.`,

  'settlement-risk': `**Verdict** — Pass · Fair value ~50% · Edge ~0pp · Conviction Low

**Thesis** — The two platforms price this similarly, and the settlement risk makes the small gap untradeable.

**Drivers**
- Settlement criteria and the data source differ between platforms
- Flagged unsafe for arbitrage

**Bull / Bear**
- Bull: none compelling
- Bear: settlement mismatch can flip one leg

**Signal read** — The cross-platform price gap is noise once you account for round-trip trading fees and settlement-rule differences between the two platforms.`,

  'thin-data': `**Verdict** — Pass · Fair value ~50% · Edge ~0pp · Conviction Low

**Thesis** — Sparse data; this is a base-rate call, not a conviction trade.

**Drivers**
- Limited information and no external sources retrieved
- Reasoning from base rates only

**Bull / Bear**
- Bull: thin markets can misprice
- Bear: no signal to lean on

**Catalysts** — Watch for the first real data point before close.`,

  'longshot': `**Verdict** — Pass · Fair value ~3% · Edge ~0pp · Conviction Low

**Thesis** — A longshot priced like a longshot; no provided evidence to move it.

**Drivers**
- Low base rate for this kind of outcome
- No external news or social sources were retrieved

**Bull / Bear**
- Bull: tail outcomes happen
- Bear: nothing supports a re-rate

**Catalysts** — A surprise entrant or announcement before close.`,

  'full-context': `**Verdict** — Lean YES · Fair value ~62% · Edge +9pp · Conviction Med

**Thesis** — Superforecasters and the cross-platform comparison both lean YES, and the provided headlines support it.

**Drivers**
- Metaculus community prediction sits above the market
- Polymarket and Kalshi prices are close, so the cross-platform read is consistent
- Provided headlines reinforce the YES case

**Bull / Bear**
- Bull: multiple independent signals agree
- Bear: settlement rules differ across platforms, so treat the gap cautiously

**Sentiment** — The provided news reads net-positive for YES.

**Signal read** — The superforecaster divergence and the cross-platform price gap look like a real edge, but only after round-trip trading fees and settlement-rule differences between the two platforms.`,

  'price-history': `**Verdict** — Lean NO · Fair value ~42% · Edge -5pp · Conviction Med

**Thesis** — The recent price trend has drifted down and nothing in the data argues for a bounce.

**Drivers**
- The provided price history trends lower into close
- No external sources retrieved, so this leans on the price action and base rates

**Bull / Bear**
- Bull: oversold bounce
- Bear: the trend is intact

**Catalysts** — The next scheduled update before close.`,
};

/** Build a generic, source-honest fallback brief for any unrecorded fixture. */
function genericBrief(): string {
  return `**Verdict** — Pass · Fair value ~50% · Edge ~0pp · Conviction Low

**Thesis** — No provided context changes the listed price; this is a base-rate read.

**Drivers**
- No external news or social sources were retrieved for this market
- Reasoning from base rates only

**Bull / Bear**
- Bull: thin markets can misprice
- Bear: nothing here to lean on

**Catalysts** — Watch for the next concrete data point before close.`;
}

export function recordedBriefFor(fixtureId: unknown): string {
  if (typeof fixtureId === 'string' && RECORDED[fixtureId]) return RECORDED[fixtureId];
  return genericBrief();
}
