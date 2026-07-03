# FINAL STORY — scaffold (numbers-bound)

> **This is a fill-in scaffold, not prose to keep.** It does NOT touch your framing in
> `FINAL-STORY-WIP.md` — graft these number-bound beats into your own draft.
> Every `{{path}}` maps to a real field in `docs/data/efficiency-study.json`
> (see **Data bindings** at the bottom). `{{FIELD_NEEDED: …}}` = I couldn't confirm the
> field; fill or tell me. **No number is asserted until `verification.verifierComplete === true`.**
>
> Section list is inferred from your (compressed) outline — reorder/retitle freely.

---

## 1. The premise (Polymarket × Kalshi)
- The bet I started with: the same real-world question trades on both Polymarket and Kalshi, so prices should diverge often enough to arbitrage.
- _Beat:_ what I expected to find, in one honest sentence.

## 2. The scale of the search
- Comparison universe: **{{tradeable.total}}** tradeable markets (**{{tradeable.polymarket}}** Polymarket + **{{tradeable.kalshi}}** Kalshi), above a **\${{tradeable.liquidityFloor}}** liquidity floor.
- Full enumerated space: **{{universe.total}}** (`{{universe.polymarket}}` Polymarket — a *lower bound*, flag `{{universe.polymarketIsLowerBound}}` — + `{{universe.kalshi}}` Kalshi).
- Candidate pairs actually evaluated: **{{matching.candidates}}**, covering **{{matching.polyWithCandidates}}** Polymarket markets that had ≥1 plausible counterpart.

## 3. The matching problem (wording differs)
- Same event ≠ same contract. Two markets can read alike and resolve on different criteria/dates.
- Method: `{{matching.method}}` (embed `{{matching.embeddingModel}}`, verify `{{matching.verificationModel}}`, prompt `{{matching.promptVersion}}`).
- Retrieval quality: recall@1 = **{{recall.recallAt1}}**, recall@5 = **{{recall.recallAt5}}**.

## 4. Verification (same event → same contract)
- LLM-verified **same-event (topical) overlaps: {{matching.topicalOverlaps}}**.
- Of those, **same-contract (same resolution criteria): {{matching.sameContract}}**, and **priceable both sides: {{matching.sameContractPriceable}}**.
- Provenance: single model `{{verification.model}}` / prompt `{{verification.promptVersion}}`, mixed-model = `{{verification.mixedModel}}`, status `{{verification.status}}` (`verifierComplete = {{verification.verifierComplete}}`).

## 5. The finding (prediction markets are ~efficient)
- Apparent gap distribution on same-contract pairs: median **{{gapDistribution.medianGap}}**, p90 **{{gapDistribution.p90Gap}}**, max **{{gapDistribution.maxGap}}** (round-trip fees ≈ **{{fees.roundTrip}}**).
- Funnel after triage (`npm run retriage`):
  - priced within fees (no real gap): **{{triage.counts.validated_same_contract}}**
  - apparent fee-clearing gaps: **{{triage.counts.apparent_fee_clearing_gap}}**
  - killed by **scope mismatch**: **{{triage.counts.scope_mismatch}}**
  - killed by **entity mismatch**: **{{triage.counts.entity_mismatch_rejected}}**
  - killed by **thin/dead liquidity**: **{{triage.counts.thin_or_dead_liquidity}}**
  - dropped degenerate (unpriceable): **{{triage.counts.dropped_degenerate}}**
  - **confirmed arbitrage: {{triage.confirmedArb}}** ← the punchline
- _Beat:_ the premise died here — the edge was mostly mismatch and microstructure, not free money.
- `{{FIELD_NEEDED: any extra triage.counts labels beyond the above — run `node -e "console.log(Object.keys(require('./docs/data/efficiency-study.json').triage.counts))"` after retriage}}`

## 6. The pivot (scanner → research terminal)
- Reframe: not an arbitrage scanner but an **Efficiency Lab + decision-support terminal** — surface where markets *dis*agree and let a human judge, with calibration tracking.
- Actionable signal counts: surfaced ≥3pp **{{actionable.surfaced_3pp}}**, beats fees **{{actionable.beatsFees_9pp}}**, meets detector threshold **{{actionable.meetsDetectorThreshold_19pp}}**. `{{FIELD_NEEDED: confirm these three actionable.* key names against the artifact}}`

## 7. The engineering (reliability is the product too)
- Batch verification transport (quota-safe, resumable) + the reliability layer: `verify:batch:doctor` stall classification, crash-resilient poller + heartbeat, atomic manifests, single-model provenance guard.
- _Beat:_ how the infra failure (silent poller death) became part of the story.

## 8. Honesty & methodology / limits
- What the numbers mean and don't: standalone-market unit, fee model, liquidity floor `\${{tradeable.liquidityFloor}}`, snapshot-in-time.
- The public site is a **frozen snapshot** (captured date in `snapshot-meta.json`), not live.

## 9. What's next / close
- One-line takeaway tied to **{{triage.confirmedArb}}** confirmed arbs out of **{{matching.candidates}}** candidates.

---

## Data bindings (placeholder → exact field → source)

All paths are top-level keys of `docs/data/efficiency-study.json`.

**From `npm run study` (matching/universe/verification):**
| placeholder | meaning |
|---|---|
| `universe.total` / `.polymarket` / `.polymarketIsLowerBound` / `.kalshi` | full enumerated space (Polymarket count is a lower bound) |
| `tradeable.total` / `.polymarket` / `.kalshi` / `.liquidityFloor` | universe above the liquidity floor |
| `matching.candidates` | candidate pairs evaluated |
| `matching.polyWithCandidates` | Polymarket markets with ≥1 candidate |
| `matching.topicalOverlaps` | LLM-verified same-event pairs |
| `matching.sameContract` | same resolution criteria |
| `matching.sameContractPriceable` | + live price both sides |
| `matching.method` / `.embeddingModel` / `.verificationModel` / `.promptVersion` | method provenance |
| `recall.recallAt1` / `.recallAt5` | retrieval quality |
| `verification.verifierComplete` / `.status` / `.model` / `.promptVersion` / `.mixedModel` | **gate flag** + provenance |
| `fees.roundTrip` / `.polymarket` / `.kalshi` | fee model |
| `gapDistribution.medianGap` / `.p90Gap` / `.maxGap` | apparent gap spread |
| `actionable.surfaced_3pp` / `.beatsFees_9pp` / `.meetsDetectorThreshold_19pp` | signal tiers (CONFIRM key names) |

**From `npm run retriage` (triage — empty until retriage runs):**
| placeholder | meaning |
|---|---|
| `triage.confirmedArb` | confirmed arbitrage count (the punchline) |
| `triage.counts.validated_same_contract` | priced within fees |
| `triage.counts.apparent_fee_clearing_gap` | apparent gaps > fees |
| `triage.counts.scope_mismatch` | wrong scope |
| `triage.counts.entity_mismatch_rejected` | wrong entity |
| `triage.counts.thin_or_dead_liquidity` | untradeable |
| `triage.counts.dropped_degenerate` | unpriceable |
| `triage.counts.confirmed_arbitrage` | == `triage.confirmedArb` |

> Fill workflow: after `npm run study` + `npm run retriage`, every `{{path}}` resolves from
> `docs/data/efficiency-study.json`. I can write a one-shot substitution to fill them once the
> gate is green — say the word.
