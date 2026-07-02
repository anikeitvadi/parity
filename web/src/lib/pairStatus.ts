import type { PairRow, PairStatus } from '../api/client.js';

/** Locked platform colors (DESIGN §): Polymarket BLUE, Kalshi GREEN. */
export const POLY = '#60A5FA';
export const KALSHI = '#22C55E';
export const FEE = '#F59E0B'; // fee-floor / detector reference lines

export const usd = (n: number): string =>
  n >= 1000 ? `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : `$${Math.round(n)}`;
export const pp = (g: number): string => `${(g * 100).toFixed(1)}pp`;

/**
 * Honest status semantics. The verifier's "same contract" call is CACHED and — except for the strict
 * survivors that pass all 7 spec checks — was NOT strictly spec-verified. So we never render a bare
 * "same contract" claim: the broad LLM same-contract set is relabelled "Candidate", the fee-clearing
 * set is "Apparent gap", and only strict survivors earn "Same contract ✓". See verdictDisplay().
 */
export const PAIR_STATUS: Record<
  PairStatus,
  { label: string; short: string; color: string; chip: string }
> = {
  survivor: {
    label: 'Apparent gap',
    short: 'GAP',
    color: '#FBBF24',
    chip: 'bg-[#78350F]/40 text-[#FBBF24] border-[#92400E]/50',
  },
  same_contract: {
    label: 'Candidate',
    short: 'CAND',
    color: '#38BDF8',
    chip: 'bg-[#0C4A6E]/40 text-[#7DD3FC] border-[#075985]/50',
  },
  spec_mismatch: {
    label: 'Spec mismatch',
    short: 'MISMATCH',
    color: '#F87171',
    chip: 'bg-[#7F1D1D]/50 text-[#FCA5A5] border-[#991B1B]/50',
  },
  topical: {
    label: 'Same event',
    short: 'TOPICAL',
    color: '#94A3B8',
    chip: 'bg-[#1E293B] text-[#94A3B8] border-[#334155]',
  },
  stale: {
    label: 'Near-settled',
    short: 'STALE',
    color: '#64748B',
    chip: 'bg-[#0E1223] text-[#64748B] border-[#1E293B]',
  },
};

/** The 7-point contract checklist, in display order. */
export const CHECKS: { key: string; label: string }[] = [
  { key: 'same_event', label: 'Event' },
  { key: 'same_entity', label: 'Entity' },
  { key: 'same_window', label: 'Window' },
  { key: 'same_line', label: 'Line' },
  { key: 'same_settlement', label: 'Settle' },
  { key: 'same_direction', label: 'Dir' },
  { key: 'same_structure', label: 'Struct' },
];

/**
 * Deterministic "the verifier is probably over-matching" detector — the known false-positive shapes
 * where two structurally-similar questions are actually different contracts. Returns a short reason
 * or null. Conservative on purpose (catches the named patterns, not everything). Shared with the
 * offline correction layer so the app warning and the artifact patch agree.
 */
export function suspiciousReason(polyTitle: string, kalshiTitle: string): string | null {
  const P = (polyTitle || '').toLowerCase();
  const K = (kalshiTitle || '').toLowerCase();
  const isTotal = (s: string) => /(o\/u|over\/under|\btotal\b)/.test(s);
  const isHalf = (s: string) => /(first half|second half|1st half|2nd half)/.test(s);

  // Tournament/global top scorer vs one country's internal goal leader.
  if (/(top goalscorer|top scorer|golden boot)/.test(P) && /goal leader/.test(K)) {
    return 'World Cup top-scorer vs a single country’s goal leader';
  }
  // Score-a-goal / goal contributions vs a country's goal leader.
  if (/(score a goal|goal contribution|to score)/.test(P) && /goal leader/.test(K)) {
    return 'Score-a-goal vs a country’s goal leader';
  }
  // "A player representing X" (any player) vs one specific named player.
  if (/(a player representing|any player)/.test(P) && /—\s*[a-zà-ÿ']+\s+[a-zà-ÿ']+/i.test(kalshiTitle)) {
    return 'Any-player market vs one specific named player';
  }
  // Full-match total vs a half-only total (or vice versa).
  if (isTotal(P) && isTotal(K) && isHalf(P) !== isHalf(K)) {
    return 'Full-match total vs a half-only total';
  }
  // Tournament / outright winner vs a single match, date, or stage.
  if (
    /(win the (world cup|championship|tournament|title|final)|tournament winner|outright)/.test(P) &&
    /(win on \d|advance|\bvs\.?\b|group stage|to reach|semifinal|quarterfinal)/.test(K)
  ) {
    return 'Tournament winner vs a single match/stage outcome';
  }
  // County-level scope on one side vs a statewide race on the other (e.g. "finish first in Orange
  // County" vs the statewide "1st place") — winning one county is not winning the race.
  const inCounty = (s: string) => /\bin [a-z.' -]*?county\b/.test(s);
  const countyRef = (s: string) => /\bcount(y|ies)\b/.test(s);
  if ((inCounty(P) && !countyRef(K)) || (inCounty(K) && !countyRef(P))) {
    return 'County-level scope vs a statewide race — different geographic contract';
  }
  return null;
}

/**
 * The one place display verdicts are decided, so queue + dossier + Lab never disagree. Only strict
 * survivors (7/7 checks) that aren't structurally suspicious earn a confident "Same contract ✓".
 */
export function verdictDisplay(pair: PairRow): {
  label: string;
  short: string;
  chip: string;
  strict: boolean;
  suspicious: string | null;
} {
  const suspicious = suspiciousReason(pair.polymarket.title, pair.kalshi.title);
  if (pair.strictSurvivor && !suspicious) {
    return {
      label: 'Same contract ✓',
      short: 'SAME ✓',
      chip: 'bg-[#064E3B]/50 text-[#6EE7B7] border-[#065F46]/50',
      strict: true,
      suspicious: null,
    };
  }
  const m = PAIR_STATUS[pair.status];
  return {
    label: m.label,
    short: m.short + (suspicious ? ' ⚠' : ''),
    chip: suspicious ? 'bg-[#78350F]/50 text-[#FBBF24] border-[#B45309]/60' : m.chip,
    strict: false,
    suspicious,
  };
}

/** The plain-language "is there anything to act on here" verdict — never over-claims same-contract. */
export function actionability(pair: PairRow): string {
  const suspicious = suspiciousReason(pair.polymarket.title, pair.kalshi.title);
  if (suspicious) {
    return `Likely NOT the same bet — ${suspicious}. The cached verifier appears to be over-matching here; treat the gap as an artifact, not an edge.`;
  }
  switch (pair.status) {
    case 'survivor':
      if (pair.strictSurvivor)
        return `Same contract on all seven checks, with ${usd(pair.liquidity)} on the thin side — yet executability is unproven: no order-book depth, slippage, or settlement-timing test has been run.`;
      return `Apparent gap only — a cached semantic match, NOT strict-spec verified. Not actionable until the 7-point contract check passes.`;
    case 'same_contract':
      return pair.beatsFees
        ? `Candidate match — the verifier's "same contract" call is cached and was not put through the strict 7-point spec checklist. Gap ${pp(pair.gap)} clears fees, but treat it as unverified.`
        : `Candidate match — cached, not strict-spec verified. Gap ${pp(pair.gap)} is inside the ${pp(pair.feeFloor)} round-trip fee floor anyway.`;
    case 'spec_mismatch':
      return `Not the same bet${pair.reason ? ` — ${pair.reason}` : ''}. The gap is illusory.`;
    case 'topical':
      return `Same underlying event but a different contract — the two prices aren't directly comparable.`;
    case 'stale':
      return `One side is near-settled (${Math.round(pair.polymarket.yes * 100)}% vs ${Math.round(
        pair.kalshi.yes * 100
      )}%) — the gap is a stale-price artifact, not a live edge. Any cached "same contract" verdict here is unverified and often wrong.`;
  }
}

/**
 * The one-line "why isn't this free money" — the single most important datum on a pair. Reads the
 * EFFECTIVE row (live gap + liquidity), so it answers dynamically as prices move, and names the first
 * fatal gate. Where the death is fees or depth, the arithmetic is shown inline.
 */
export function causeOfDeath(pair: PairRow): string {
  const suspicious = suspiciousReason(pair.polymarket.title, pair.kalshi.title);
  if (suspicious || pair.status === 'spec_mismatch') {
    const why = suspicious ?? pair.correctionReason ?? pair.reason ?? 'the two contracts resolve differently';
    return `Different contract — ${why}. The prices compare two different bets, so the gap isn't an edge.`;
  }
  if (pair.status === 'stale') {
    return `Near-settled — one side is already resolving (${Math.round(pair.polymarket.yes * 100)}% vs ${Math.round(
      pair.kalshi.yes * 100
    )}%). The gap is a stale-price artifact, not a live edge.`;
  }
  if (pair.status === 'topical') {
    return `Same event, different contract — the two prices answer different questions and aren't directly comparable.`;
  }
  if (!pair.beatsFees) {
    return `Dies on fees: gap ${pp(pair.gap)} − ~${pp(pair.feeFloor)} round-trip = ${pp(
      pair.gap - pair.feeFloor
    )} net. It never clears the fee floor.`;
  }
  if (pair.liquidity < 10000) {
    return `Dies on depth: the gap clears fees, but only ${usd(pair.liquidity)} sits on the thin side — below the >$10k the deepest gate needs.`;
  }
  if (!pair.strictSurvivor) {
    return `Unverified: clears fees and depth, but hasn't passed the 7-point contract-spec check — not confirmed as the same bet.`;
  }
  return `Passes every automated gate. What stays unproven is the last mile no dataset settles: order-book depth, slippage, and settlement timing.`;
}
