import React from 'react';
import { PriceBar } from './PriceBar.js';

interface CrossPlatformComparisonProps {
  currentPlatform: string;
  currentPrices: Record<string, number>;
  matchedPlatform: string;
  matchedPrices: Record<string, number>;
  confidence: number;
  settlement?: {
    safeForArbitrage: boolean;
    riskFactors: string[];
    similarity: { overall: number };
  };
}

export function CrossPlatformComparison({
  currentPlatform,
  currentPrices,
  matchedPlatform,
  matchedPrices,
  confidence,
  settlement,
}: CrossPlatformComparisonProps) {
  const currentYes = currentPrices['Yes'] ?? currentPrices['yes'] ?? Object.values(currentPrices)[0] ?? 0.5;
  const matchedYes = matchedPrices['Yes'] ?? matchedPrices['yes'] ?? Object.values(matchedPrices)[0] ?? 0.5;
  const delta = Math.abs(currentYes - matchedYes);

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Cross-Platform Comparison</h3>
        <span className="text-xs text-gray-500">
          Match: {(confidence * 100).toFixed(0)}%
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs text-gray-500 mb-1 capitalize">{currentPlatform}</div>
          <PriceBar yesPrice={currentYes} size="sm" />
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1 capitalize">{matchedPlatform}</div>
          <PriceBar yesPrice={matchedYes} size="sm" />
        </div>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-400">
          Price Delta:{' '}
          <span className={delta > 0.05 ? 'text-yellow-400 font-medium' : 'text-gray-300'}>
            {(delta * 100).toFixed(1)}%
          </span>
        </span>

        {settlement && (
          <span
            className={
              settlement.safeForArbitrage
                ? 'text-green-400 text-xs'
                : 'text-red-400 text-xs'
            }
          >
            Settlement: {settlement.safeForArbitrage ? 'Safe' : 'Mismatch'}
          </span>
        )}
      </div>

      {settlement?.riskFactors && settlement.riskFactors.length > 0 && (
        <div className="mt-2 text-xs text-yellow-500">
          {settlement.riskFactors.map((rf, i) => (
            <div key={i}>- {rf}</div>
          ))}
        </div>
      )}
    </div>
  );
}
