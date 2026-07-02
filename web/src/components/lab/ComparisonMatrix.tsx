import type { EfficiencyStudy } from '../../api/client';
import { funnelStages } from '../../lib/funnel';

/**
 * The funnel ledger (DESIGN.md §10 proof layer) — the exact numeric companion to the
 * CompressionWaterfall bars: per stage, how many remain, what fraction of the previous stage
 * that is, and how many were culled and why. The data-dense counterweight to the hero's motion.
 * "Kept" / "Removed" are blank across the markets→pairs boundary (Candidate pairs), where a
 * numeric ratio would cross units and mislead.
 */

const fmt = (n: number) => n.toLocaleString('en-US');

export function ComparisonMatrix({ study }: { study: EfficiencyStudy }) {
  const stages = funnelStages(study);
  if (stages.length === 0) return null;

  return (
    <div className="border border-[#1E293B] rounded-md p-3 bg-[#0E1223] overflow-x-auto">
      <div className="text-[10px] uppercase tracking-wider text-[#64748B] mb-3">Funnel ledger · exact figures</div>
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="text-[#64748B] font-mono text-[10px] uppercase tracking-wider">
            <th className="text-left font-medium px-2 py-1.5 border border-[#1E293B] bg-[#020617]">stage</th>
            <th className="text-right font-medium px-2 py-1.5 border border-[#1E293B] bg-[#020617]">count</th>
            <th className="text-right font-medium px-2 py-1.5 border border-[#1E293B] bg-[#020617]">kept</th>
            <th className="text-right font-medium px-2 py-1.5 border border-[#1E293B] bg-[#020617]">removed</th>
            <th className="text-left font-medium px-2 py-1.5 border border-[#1E293B] bg-[#020617]">reason</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {stages.map((s, i) => {
            const prev = i > 0 ? stages[i - 1].value : 0;
            const keptPct = s.cut != null && prev > 0 ? (s.value / prev) * 100 : null;
            return (
              <tr key={s.key} className={s.terminal ? 'bg-[#7F1D1D]/[0.10]' : ''}>
                <td className={`text-left px-2 py-1.5 border border-[#1E293B] ${s.terminal ? 'text-[#F8FAFC] font-medium' : 'text-[#CBD5E1]'}`}>
                  {s.label}
                </td>
                <td className="text-right font-mono px-2 py-1.5 border border-[#1E293B] text-[#F8FAFC]">{fmt(s.value)}</td>
                <td className="text-right font-mono px-2 py-1.5 border border-[#1E293B] text-[#94A3B8]">
                  {keptPct == null ? '—' : `${keptPct.toFixed(keptPct < 10 ? 1 : 0)}%`}
                </td>
                <td className="text-right font-mono px-2 py-1.5 border border-[#1E293B] text-[#94A3B8]">
                  {s.cut == null ? '—' : `−${fmt(s.cut)}`}
                </td>
                <td className="text-left px-2 py-1.5 border border-[#1E293B] text-[#64748B]">{s.cutReason ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
