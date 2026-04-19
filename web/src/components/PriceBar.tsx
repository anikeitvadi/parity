import React from 'react';

interface PriceBarProps {
  yesPrice: number; // 0-1
  size?: 'sm' | 'md';
}

export function PriceBar({ yesPrice, size = 'md' }: PriceBarProps) {
  const yesPct = Math.round(yesPrice * 100);
  const noPct = 100 - yesPct;
  const h = size === 'sm' ? 'h-2' : 'h-4';

  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-green-400 text-sm font-mono w-10 text-right">{yesPct}%</span>
      <div className={`flex-1 flex ${h} rounded-full overflow-hidden bg-gray-800`}>
        <div
          className="bg-green-500 transition-all duration-300"
          style={{ width: `${yesPct}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-300"
          style={{ width: `${noPct}%` }}
        />
      </div>
      <span className="text-red-400 text-sm font-mono w-10">{noPct}%</span>
    </div>
  );
}
