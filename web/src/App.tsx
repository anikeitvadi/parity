import React, { useState, useEffect, Suspense, lazy } from 'react';
import { TerminalPage } from './pages/TerminalPage.js';
import { SnapshotBadge } from './components/SnapshotBadge.js';
import { IS_STATIC } from './api/client.js';

// The Lab is the only consumer of Observable Plot (~270KB) — code-split so the
// Terminal view doesn't pay for it.
const LabPage = lazy(() => import('./pages/LabPage.js').then((m) => ({ default: m.LabPage })));

function Clock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString('en-US', { hour12: false, timeZone: 'UTC' }) + ' UTC');
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-[11px] text-[#64748B]">{time}</span>;
}

export function App() {
  const [tab, setTab] = useState<'scanner' | 'lab'>('lab');

  return (
    <div className="h-screen flex flex-col" style={{ background: '#020617' }}>
      {/* Header bar — 28px, compact */}
      <header className="h-7 shrink-0 flex items-center justify-between px-3 border-b border-[#1E293B]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Two offset dots — Polymarket (blue) + Kalshi (green) — overlapping on the cross-listed set. */}
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none" aria-hidden="true">
              <circle cx="7" cy="7" r="5" fill="#60A5FA" fillOpacity="0.9" />
              <circle cx="13" cy="7" r="5" fill="#22C55E" fillOpacity="0.6" />
            </svg>
            <span className="text-[12px] font-semibold text-[#F8FAFC] tracking-tight">Parity</span>
            <span className="hidden md:inline text-[10px] text-[#475569]">prediction-market efficiency</span>
          </div>
          <nav className="flex items-center gap-1">
            {(['lab', 'scanner'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`text-[11px] px-2 py-0.5 rounded transition-colors ${
                  tab === t ? 'bg-[#1E293B] text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#94A3B8]'
                }`}
              >
                {t === 'scanner' ? 'Terminal' : 'Lab'}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-2 md:gap-4 min-w-0">
          <SnapshotBadge />
          <div className="hidden md:block"><Clock /></div>
          {!IS_STATIC && (
            <a
              href="/api/status"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-[#64748B] hover:text-[#94A3B8] transition-colors"
            >
              Diagnostics
            </a>
          )}
        </div>
      </header>

      {/* Active view fills the rest */}
      {tab === 'scanner' ? (
        <TerminalPage onOpenLab={() => setTab('lab')} />
      ) : (
        <Suspense fallback={<div className="flex-1 flex items-center justify-center text-[12px] text-[#64748B]">Loading lab…</div>}>
          <LabPage />
        </Suspense>
      )}
    </div>
  );
}
