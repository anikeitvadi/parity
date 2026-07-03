import type { EfficiencyStudy } from '../../api/client';
import { funnelStages, type CorrectedCounts } from '../../lib/funnel';

/**
 * The compression waterfall (DESIGN.md §10 proof layer) — the locked 11-stage funnel made
 * legible in one frame. Log-scale bars so 52,858 → 0 reads at a glance; each stage carries the
 * cull that produced it ("−337 · entity / scope mismatch"), so the chart tells the story of the
 * verifier discarding its own matcher's false positives. The terminal (0 clear executable arb)
 * is deliberately NOT green — there is no edge to celebrate.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

function logWidth(n: number, max: number): number {
  if (n <= 0 || max <= 0) return 0;
  return Math.max(3, Math.min(100, (Math.log10(n) / Math.log10(max)) * 100));
}

export function CompressionWaterfall({ study, corrected }: { study: EfficiencyStudy; corrected?: CorrectedCounts }) {
  const stages = funnelStages(study, corrected);
  if (stages.length === 0) return null;
  const max = stages[0].value || 1;
  const enumerated = study.pairSpace?.enumerated;

  return (
    <div className="border border-[#1E293B] rounded-md p-4 bg-[#0E1223]">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-[#64748B]">Compression waterfall · log scale</div>
        {enumerated ? (
          <div className="text-[10px] text-[#64748B] font-mono tabular-nums">
            from {enumerated >= 1e9 ? `${(enumerated / 1e9).toFixed(2)}B` : fmt(enumerated)} possible cross-listings
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-[6px]">
        {stages.map((s) => {
          const w = logWidth(s.value, max);
          return (
            <div key={s.key} className="grid grid-cols-[104px_1fr_92px] sm:grid-cols-[190px_1fr_138px] items-center gap-2 sm:gap-3">
              <div className="text-[12px] leading-tight">
                <span className={s.terminal ? 'text-[#F8FAFC] font-semibold' : 'text-[#CBD5E1]'}>{s.label}</span>
                <span className="block text-[10px] text-[#64748B]">{s.sub}</span>
              </div>
              <div className="h-[20px] relative">
                {s.terminal ? (
                  <div className="absolute inset-y-0 left-0 w-full flex items-center">
                    <div className="h-[2px] w-6 bg-[#475569]" />
                    <span className="ml-2 text-[10px] text-[#64748B] italic hidden sm:inline whitespace-nowrap">none demonstrable</span>
                  </div>
                ) : (
                  <div
                    className="h-full rounded-[4px]"
                    style={{ width: `${w}%`, background: 'linear-gradient(90deg,#0891B2,#22D3EE)' }}
                  />
                )}
              </div>
              <div className="text-right leading-tight">
                <div className={`font-mono tabular-nums text-[15px] ${s.terminal ? 'text-[#F8FAFC] font-semibold' : 'text-[#F8FAFC]'}`}>
                  {fmt(s.value)}
                </div>
                {s.cut != null && s.cutReason ? (
                  <div className="text-[9.5px] text-[#64748B] font-mono tabular-nums">
                    −{fmt(s.cut)} · {s.cutReason}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
