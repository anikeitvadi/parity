import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import type { MarketDetailResponse } from '../api/client.js';
import { useResearch } from '../hooks/useResearch.js';
import { useSavedMarkets } from '../hooks/useSavedMarkets.js';
import { getYesPrice, kellyEstimate } from '../lib/utils.js';
import { EvidenceBoard } from './EvidenceBoard.js';

interface Props {
  detail: MarketDetailResponse | null;
  loading: boolean;
  selectedId: { platform: string; id: string } | null;
  onSelectMarket: (platform: string, id: string) => void;
}

export function DecisionPane({ detail, loading, selectedId, onSelectMarket }: Props) {
  const { saved, save, remove, isSaved } = useSavedMarkets();

  // No market selected → your dashboard (track record + saved).
  if (!selectedId) {
    return <Dashboard saved={saved} onSelect={onSelectMarket} onRemove={remove} />;
  }

  if (loading || !detail) {
    return (
      <div className="p-4 space-y-3">
        <div className="h-6 w-3/4 bg-[#0E1223] rounded animate-pulse" />
        <div className="h-40 bg-[#0E1223] rounded animate-pulse" />
        <div className="h-24 bg-[#0E1223] rounded animate-pulse" />
      </div>
    );
  }

  const market = detail.market;
  const yesPrice = getYesPrice(market.prices);

  return (
    <div className="h-full overflow-y-auto">
      <EvidenceBoard detail={detail} loading={false} />
      <div className="px-3 pb-4">
        <div className="border-t border-[#1E293B] my-1" />
        <BriefAndCall
          key={`${selectedId.platform}:${selectedId.id}`}
          market={market}
          yesPrice={yesPrice}
          selectedId={selectedId}
          marketSaved={isSaved(market.id, market.platform)}
          onSave={() => save({ id: market.id, platform: market.platform, question: market.question, yesPrice })}
          onUnsave={() => remove(market.id, market.platform)}
          hasMetaculus={!!detail.metaculus}
          hasCrossPlatform={!!detail.crossPlatform?.matchedMarket}
        />
      </div>
    </div>
  );
}

// --- Brief + Your Call ---
function BriefAndCall({
  market,
  yesPrice,
  selectedId,
  marketSaved,
  onSave,
  onUnsave,
  hasMetaculus,
  hasCrossPlatform,
}: {
  market: { id: string; platform: string; question: string; metadata?: Record<string, unknown> };
  yesPrice: number;
  selectedId: { platform: string; id: string };
  marketSaved: boolean;
  onSave: () => void;
  onUnsave: () => void;
  hasMetaculus: boolean;
  hasCrossPlatform: boolean;
}) {
  const { content, isStreaming, error, start, stop } = useResearch(selectedId.platform, selectedId.id);
  const [forecast, setForecast] = useState(Math.round(yesPrice * 100));
  const [forecastLogged, setForecastLogged] = useState(false);
  const [thesisOpen, setThesisOpen] = useState(false);
  const [thesis, setThesis] = useState('');

  // Briefs are generated on demand (saves tokens). Stop any in-flight stream
  // if the user switches markets — this section is keyed by market.
  useEffect(() => stop, [stop]);

  const kelly = kellyEstimate(forecast / 100, yesPrice);

  const logForecast = async () => {
    try {
      await fetch('/api/calibration/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId: market.id,
          platform: market.platform,
          marketQuestion: market.question,
          forecastProbability: forecast / 100,
          marketPrice: yesPrice,
          category: (market.metadata as Record<string, unknown>)?.category,
        }),
      });
      setForecastLogged(true);
    } catch { /* ignore */ }
  };

  const sources: string[] = ['Market data'];
  if (hasMetaculus) sources.push('Metaculus');
  if (hasCrossPlatform) sources.push('Cross-platform');
  sources.push('News');

  return (
    <div className="space-y-3 mt-3">
      {/* AI Brief */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-[#64748B] uppercase tracking-wider">AI Brief</span>
          <span className="text-[10px] text-[#64748B]">{sources.join(' · ')}</span>
        </div>
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
          {error && <div className="text-[11px] text-[#EF4444] mb-2">{error}</div>}
          {content ? (
            <div className="prose prose-invert max-w-none text-[12px] leading-relaxed [&_h1]:text-[13px] [&_h2]:text-[12px] [&_h3]:text-[12px] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:mt-3 [&_h2]:mt-2 [&_h3]:mt-2 [&_p]:mb-1.5 [&_ul]:mb-1.5 [&_li]:mb-0.5 [&_strong]:text-[#F8FAFC]">
              <Markdown>{content}</Markdown>
              {isStreaming && <span className="text-[#06B6D4] animate-pulse">|</span>}
            </div>
          ) : isStreaming ? (
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] animate-pulse">Generating research brief...</span>
              <button onClick={stop} className="text-[10px] text-[#64748B] hover:text-[#EF4444]">Stop</button>
            </div>
          ) : (
            <button
              onClick={start}
              className="w-full py-2 text-[11px] font-medium text-[#06B6D4] border border-[#06B6D4]/30 rounded hover:bg-[#06B6D4]/10 transition-colors"
            >
              Generate Brief
            </button>
          )}
          {!isStreaming && content && (
            <button onClick={start} className="text-[10px] text-[#64748B] hover:text-[#94A3B8] mt-2">
              Regenerate
            </button>
          )}
        </div>
      </div>

      {/* Your Call */}
      <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3">
        <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-2">Your Call</div>
        <input
          type="range"
          min={1}
          max={99}
          value={forecast}
          onChange={(e) => { setForecast(Number(e.target.value)); setForecastLogged(false); }}
          className="w-full h-1 appearance-none bg-[#1E293B] rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#06B6D4] [&::-webkit-slider-thumb]:cursor-pointer"
        />
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-[13px] font-mono font-semibold text-[#F8FAFC]">{forecast}% YES</span>
          <span className="text-[11px] text-[#64748B]">Market: {Math.round(yesPrice * 100)}%</span>
        </div>
        {kelly.fraction > 0 && (
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-[11px] font-medium ${forecast / 100 > yesPrice ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
              {kelly.direction}
            </span>
            <span className="text-[11px] text-[#64748B]">Kelly: {(kelly.fraction * 100).toFixed(1)}% of bankroll</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {forecastLogged ? (
          <span className="flex-1 text-center text-[11px] text-[#22C55E] py-1.5">✓ Forecast logged</span>
        ) : (
          <button
            onClick={logForecast}
            className="flex-1 py-1.5 bg-[#06B6D4] hover:bg-[#22D3EE] text-[#020617] text-[11px] font-medium rounded transition-colors"
          >
            Log Forecast
          </button>
        )}
        <button
          onClick={marketSaved ? onUnsave : onSave}
          className={`px-3 py-1.5 text-[11px] rounded border transition-colors ${
            marketSaved
              ? 'bg-[#06B6D4]/10 text-[#06B6D4] border-[#06B6D4]/30'
              : 'bg-transparent text-[#64748B] border-[#1E293B] hover:text-[#F8FAFC]'
          }`}
        >
          {marketSaved ? 'Saved' : 'Save'}
        </button>
        <button
          onClick={() => setThesisOpen(!thesisOpen)}
          className="px-3 py-1.5 text-[11px] text-[#64748B] border border-[#1E293B] rounded hover:text-[#F8FAFC] transition-colors"
        >
          Thesis
        </button>
      </div>

      {thesisOpen && (
        <textarea
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
          placeholder="Your thesis on this market..."
          className="w-full h-16 bg-[#0E1223] border border-[#1E293B] rounded p-2 text-[11px] text-[#F8FAFC] placeholder-[#64748B] resize-none focus:outline-none focus:border-[#06B6D4]"
        />
      )}
    </div>
  );
}

// --- Dashboard (no market selected) ---
function Dashboard({
  saved,
  onSelect,
  onRemove,
}: {
  saved: { id: string; platform: string; question: string; yesPrice: number }[];
  onSelect: (platform: string, id: string) => void;
  onRemove: (id: string, platform: string) => void;
}) {
  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      <div className="text-[11px] text-[#64748B]">
        Select a market to research, or review your track record below.
      </div>
      <TrackRecord />
      <div>
        <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1.5">
          Saved markets ({saved.length})
        </div>
        {saved.length === 0 ? (
          <div className="text-[11px] text-[#64748B]">Nothing saved yet — hit Save on a market.</div>
        ) : (
          <div className="space-y-1">
            {saved.map((m) => (
              <div
                key={`${m.platform}-${m.id}`}
                onClick={() => onSelect(m.platform, m.id)}
                className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-[#0E1223] transition-colors"
              >
                <span className="font-mono text-[12px] text-[#22C55E] w-8">{Math.round(m.yesPrice * 100)}%</span>
                <span className="text-[11px] text-[#F8FAFC] truncate flex-1">{m.question}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(m.id, m.platform); }}
                  className="text-[10px] text-[#64748B] hover:text-[#EF4444]"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Track record (plain-language calibration) ---
interface CalBucket {
  range: string;
  midpoint: number;
  forecasts: number;
  outcomes: number;
  observedFrequency: number;
}
interface CalStats {
  totalForecasts: number;
  resolvedForecasts: number;
  meanBrierScore: number | null;
  assessment: string;
  calibrationCurve: CalBucket[];
}

function TrackRecord() {
  const [stats, setStats] = useState<CalStats | null>(null);

  useEffect(() => {
    fetch('/api/calibration/stats').then((r) => r.json()).then(setStats).catch(() => {});
  }, []);

  if (!stats) return <div className="text-[11px] text-[#64748B]">Loading track record…</div>;

  const verdict = calibrationVerdict(stats.calibrationCurve);

  return (
    <div>
      <div className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1.5">Your track record</div>

      {stats.resolvedForecasts === 0 ? (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3 text-[11px] text-[#64748B] leading-relaxed">
          {stats.totalForecasts > 0
            ? `${stats.totalForecasts} forecast${stats.totalForecasts > 1 ? 's' : ''} logged, none resolved yet.`
            : 'No forecasts yet.'}
          {' '}Log your probability on markets — once they resolve, this shows whether
          things you call <span className="text-[#F8FAFC]">70%</span> actually happen ~70% of the time.
        </div>
      ) : (
        <div className="bg-[#0E1223] border border-[#1E293B] rounded p-3 space-y-3">
          <div className="text-[11px] text-[#F8FAFC] leading-snug">{verdict}</div>

          {/* Per-bucket: predicted vs actual */}
          <div className="space-y-2">
            {stats.calibrationCurve.map((b) => {
              const predicted = Math.round(b.midpoint * 100);
              const actual = Math.round(b.observedFrequency * 100);
              const errPp = actual - predicted;
              return (
                <div key={b.range}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-[#94A3B8]">You said {b.range} · {b.forecasts} call{b.forecasts > 1 ? 's' : ''}</span>
                    <span className="text-[#64748B]">{b.outcomes}/{b.forecasts} happened ({actual}%)</span>
                  </div>
                  <div className="relative h-1.5 bg-[#1E293B] rounded-full">
                    {/* actual outcome bar */}
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full ${Math.abs(errPp) <= 10 ? 'bg-[#22C55E]' : 'bg-[#F59E0B]'}`}
                      style={{ width: `${actual}%` }}
                    />
                    {/* predicted marker */}
                    <div className="absolute inset-y-[-2px] w-0.5 bg-[#06B6D4]" style={{ left: `${predicted}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 text-[10px] text-[#64748B] pt-1 border-t border-[#1E293B]">
            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#06B6D4]" /> you predicted</span>
            <span className="flex items-center gap-1"><span className="w-2 h-1 bg-[#22C55E] rounded-full" /> actually happened</span>
            <span className="flex-1" />
            {stats.meanBrierScore != null && (
              <span title="Brier score — lower is better; 0.25 is a coin flip">
                Brier {stats.meanBrierScore.toFixed(3)}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Turn the calibration curve into one plain-language sentence. */
function calibrationVerdict(curve: CalBucket[]): string {
  if (curve.length === 0) return '';
  let weightedErr = 0;
  let n = 0;
  for (const b of curve) {
    // signed: predicted − observed. positive = overconfident.
    weightedErr += (b.midpoint - b.observedFrequency) * b.forecasts;
    n += b.forecasts;
  }
  const avgPp = Math.round((weightedErr / Math.max(1, n)) * 100);
  if (Math.abs(avgPp) <= 5) return `You're well calibrated — when you commit to a probability, reality tends to agree.`;
  if (avgPp > 5) return `You're overconfident by ~${avgPp}pp — things you call likely happen less often than you think.`;
  return `You're underconfident by ~${Math.abs(avgPp)}pp — things you doubt happen more often than you think.`;
}
