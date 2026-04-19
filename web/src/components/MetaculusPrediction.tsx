import React from 'react';

interface MetaculusPredictionProps {
  prediction: number;
  marketPrice: number;
  title: string;
  forecastAge?: number;
}

export function MetaculusPrediction({
  prediction,
  marketPrice,
  title,
  forecastAge,
}: MetaculusPredictionProps) {
  const divergence = Math.abs(prediction - marketPrice);
  const isSignificant = divergence > 0.05;

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">Metaculus Forecast</h3>
        {forecastAge != null && (
          <span
            className={`text-xs ${
              forecastAge <= 7 ? 'text-green-400' : forecastAge <= 14 ? 'text-yellow-400' : 'text-red-400'
            }`}
          >
            {forecastAge}d old
          </span>
        )}
      </div>

      <p className="text-xs text-gray-500 mb-3 line-clamp-1">{title}</p>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-xs text-gray-500">Forecasters</div>
          <div className="text-lg font-bold text-cyan-400">
            {(prediction * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Market</div>
          <div className="text-lg font-bold text-gray-300">
            {(marketPrice * 100).toFixed(0)}%
          </div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Divergence</div>
          <div
            className={`text-lg font-bold ${isSignificant ? 'text-yellow-400' : 'text-gray-500'}`}
          >
            {(divergence * 100).toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );
}
