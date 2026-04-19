import React, { useState, useEffect } from 'react';

interface SystemStatus {
  api: { status: string };
  markets: {
    polymarket: { count: number; cached: boolean; fetchTime?: number };
    kalshi: { count: number; cached: boolean; fetchTime?: number };
  };
  database: {
    snapshots: number;
    matches: number;
    opportunities: number;
    forecasts: number;
  };
  embeddings: { count: number; hasApiKey: boolean };
}

export function StatusPage() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) setStatus(await res.json());
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div className="text-center py-12 text-gray-500">Loading system status...</div>;
  }

  if (!status) {
    return <div className="text-center py-12 text-red-400">Failed to load status. Is the API server running?</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">System Status</h1>
      <p className="text-gray-500 text-sm mb-6">
        Pipeline health, data freshness, and system configuration.
      </p>

      {/* Pipeline visualization */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-4">Data Pipeline</h2>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <PipelineNode label="Polymarket API" status={status.markets.polymarket.count > 0 ? 'ok' : 'warn'} detail={`${status.markets.polymarket.count} markets`} />
          <Arrow />
          <PipelineNode label="Kalshi API" status={status.markets.kalshi.count > 0 ? 'ok' : 'warn'} detail={`${status.markets.kalshi.count} markets`} />
          <Arrow />
          <PipelineNode label="Quality Filter" status="ok" detail="Meme/dead removed" />
          <Arrow />
          <PipelineNode label="Watchlist Engine" status="ok" detail="4 categories" />
          <Arrow />
          <PipelineNode label="Web UI" status="ok" detail="localhost:5173" />
        </div>
        <div className="flex items-center gap-2 text-sm mt-4 flex-wrap">
          <PipelineNode label="Embeddings" status={status.embeddings.hasApiKey ? 'ok' : 'off'} detail={status.embeddings.hasApiKey ? `${status.embeddings.count} stored` : 'No API key'} />
          <Arrow />
          <PipelineNode label="Semantic Matcher" status={status.embeddings.hasApiKey ? 'ok' : 'off'} detail="Cross-platform" />
        </div>
        <div className="flex items-center gap-2 text-sm mt-4 flex-wrap">
          <PipelineNode label="OpenAI GPT-4o" status={status.embeddings.hasApiKey ? 'ok' : 'off'} detail={status.embeddings.hasApiKey ? 'Research briefs' : 'No API key'} />
          <Arrow />
          <PipelineNode label="News Search" status="ok" detail="DuckDuckGo" />
          <Arrow />
          <PipelineNode label="AI Brief" status={status.embeddings.hasApiKey ? 'ok' : 'off'} detail="SSE streaming" />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <StatCard label="Polymarket Markets" value={status.markets.polymarket.count} />
        <StatCard label="Kalshi Markets" value={status.markets.kalshi.count} />
        <StatCard label="DB Snapshots" value={status.database.snapshots} />
        <StatCard label="User Forecasts" value={status.database.forecasts} />
      </div>

      {/* Configuration */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Configuration</h2>
        <div className="space-y-2 text-sm">
          <ConfigRow label="OpenAI API Key" active={status.embeddings.hasApiKey} desc="Enables AI research briefs + semantic matching" />
          <ConfigRow label="Polymarket Data" active={status.markets.polymarket.count > 0} desc="Public Gamma API (no key needed)" />
          <ConfigRow label="Kalshi Data" active={status.markets.kalshi.count > 0} desc="Public Events API (no key needed)" />
          <ConfigRow label="Metaculus" active={true} desc="Public search API (no key needed)" />
          <ConfigRow label="Background Scheduler" active={false} desc="Run 'npm start' to enable periodic data collection" />
        </div>
      </div>

      {/* Tech stack */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Tech Stack</h2>
        <div className="flex flex-wrap gap-2">
          {['React 19', 'Hono', 'Vite', 'Tailwind v4', 'SQLite/WAL', 'OpenAI', 'sqlite-vec', 'SSE Streaming', 'TypeScript', 'Vitest'].map((tech) => (
            <span key={tech} className="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded">
              {tech}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function PipelineNode({ label, status, detail }: { label: string; status: 'ok' | 'warn' | 'off'; detail: string }) {
  const color = status === 'ok' ? 'border-green-500/40 bg-green-500/5' : status === 'warn' ? 'border-yellow-500/40 bg-yellow-500/5' : 'border-gray-700 bg-gray-800/50';
  const dot = status === 'ok' ? 'bg-green-400' : status === 'warn' ? 'bg-yellow-400' : 'bg-gray-600';

  return (
    <div className={`border rounded-lg px-3 py-2 ${color}`}>
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
        <span className="text-gray-200 text-xs font-medium">{label}</span>
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{detail}</div>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-600 text-xs">&rarr;</span>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-white">{value.toLocaleString()}</div>
    </div>
  );
}

function ConfigRow({ label, active, desc }: { label: string; active: boolean; desc: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${active ? 'bg-green-400' : 'bg-gray-600'}`} />
        <span className="text-gray-300">{label}</span>
      </div>
      <span className="text-xs text-gray-500">{desc}</span>
    </div>
  );
}
