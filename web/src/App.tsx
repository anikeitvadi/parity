import React, { useState, useEffect } from 'react';
import { TerminalPage } from './pages/TerminalPage.js';

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
  return (
    <div className="h-screen flex flex-col" style={{ background: '#020617' }}>
      {/* Header bar — 28px, compact */}
      <header className="h-7 shrink-0 flex items-center justify-between px-3 border-b border-[#1E293B]">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-[7px] font-bold text-white">
            PM
          </div>
          <span className="text-[12px] font-semibold text-[#F8FAFC] tracking-tight">Scanner</span>
        </div>
        <div className="flex items-center gap-4">
          <Clock />
          <a
            href="/api/status"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-[#64748B] hover:text-[#94A3B8] transition-colors"
          >
            Diagnostics
          </a>
        </div>
      </header>

      {/* Terminal fills the rest */}
      <TerminalPage />
    </div>
  );
}
