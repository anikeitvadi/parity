import React from 'react';
import { Link } from 'react-router-dom';
import { PriceBar } from './PriceBar.js';
import type { Market } from '../api/client.js';

interface MarketCardProps {
  market: Market;
}

const CATEGORY_COLORS: Record<string, string> = {
  Politics: 'text-blue-400',
  Economics: 'text-green-400',
  Sports: 'text-orange-400',
  Technology: 'text-purple-400',
  Crypto: 'text-yellow-400',
  Climate: 'text-teal-400',
  Entertainment: 'text-pink-400',
  Geopolitics: 'text-red-400',
  Health: 'text-emerald-400',
  World: 'text-cyan-400',
  Elections: 'text-blue-400',
};

function formatClosing(closeDate: string): { text: string; urgent: boolean } | null {
  const close = new Date(closeDate);
  if (isNaN(close.getTime())) return null;

  const daysLeft = (close.getTime() - Date.now()) / 86400000;

  if (daysLeft < 0) return null;
  if (daysLeft < 1) return { text: `${Math.round(daysLeft * 24)}h left`, urgent: true };
  if (daysLeft < 7) return { text: `${Math.round(daysLeft)}d left`, urgent: true };
  if (daysLeft < 30) return { text: `${Math.round(daysLeft)}d left`, urgent: false };

  return {
    text: close.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    urgent: false,
  };
}

export function MarketCard({ market }: MarketCardProps) {
  const yesPrice =
    market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;
  const category = (market.metadata?.category as string) || '';
  const closing = market.closeDate ? formatClosing(market.closeDate) : null;

  return (
    <Link
      to={`/market/${market.platform}/${encodeURIComponent(market.id)}`}
      className="block bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="text-sm font-medium text-gray-100 line-clamp-2 flex-1">
          {market.question}
        </h3>
        <span
          className={`text-xs px-2 py-0.5 rounded border shrink-0 ${
            market.platform === 'polymarket'
              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
              : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
          }`}
        >
          {market.platform === 'polymarket' ? 'Poly' : 'Kalshi'}
        </span>
      </div>

      <PriceBar yesPrice={yesPrice} size="sm" />

      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <div className="flex gap-2">
          {category && (
            <span className={CATEGORY_COLORS[category] || 'text-gray-400'}>
              {category}
            </span>
          )}
          {market.volume != null && market.volume > 0 && (
            <span>${Math.round(market.volume).toLocaleString()}</span>
          )}
        </div>
        {closing && (
          <span className={closing.urgent ? 'text-red-400 font-medium' : ''}>
            {closing.text}
          </span>
        )}
      </div>
    </Link>
  );
}
