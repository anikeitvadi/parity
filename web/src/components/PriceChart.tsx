import React from 'react';

interface PriceChartProps {
  history: { timestamp: number; data: { prices: Record<string, number> } }[];
}

export function PriceChart({ history }: PriceChartProps) {
  if (history.length < 2) {
    return <div className="text-gray-600 text-sm">Not enough price history</div>;
  }

  const prices = history.map((s) => {
    const p = s.data.prices['Yes'] ?? s.data.prices['yes'] ?? Object.values(s.data.prices)[0] ?? 0.5;
    return p;
  });

  const min = Math.min(...prices) - 0.02;
  const max = Math.max(...prices) + 0.02;
  const range = max - min || 0.1;

  const width = 300;
  const height = 80;
  const padding = 4;

  const points = prices.map((p, i) => {
    const x = padding + (i / (prices.length - 1)) * (width - padding * 2);
    const y = height - padding - ((p - min) / range) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
      <polyline
        points={polyline}
        fill="none"
        stroke="#06b6d4"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Current price dot */}
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].split(',')[0]}
          cy={points[points.length - 1].split(',')[1]}
          r="3"
          fill="#06b6d4"
        />
      )}
    </svg>
  );
}
