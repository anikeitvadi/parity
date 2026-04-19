import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchMarketDetail, type MarketDetailResponse } from '../api/client.js';
import { useSavedMarkets } from '../hooks/useSavedMarkets.js';
import { PriceBar } from '../components/PriceBar.js';
import { PriceChart } from '../components/PriceChart.js';
import { CrossPlatformComparison } from '../components/CrossPlatformComparison.js';
import { MetaculusPrediction } from '../components/MetaculusPrediction.js';
import { ResearchBrief } from '../components/ResearchBrief.js';

export function MarketDetailPage() {
  const { platform, id } = useParams<{ platform: string; id: string }>();
  const [data, setData] = useState<MarketDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!platform || !id) return;

    setLoading(true);
    setError(null);

    fetchMarketDetail(platform, id)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [platform, id]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto animate-pulse">
        <div className="h-4 w-24 bg-gray-800 rounded mb-4" />
        <div className="h-8 w-3/4 bg-gray-800 rounded mb-6" />
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <div className="h-4 w-20 bg-gray-800 rounded mb-3" />
          <div className="h-6 bg-gray-800 rounded" />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <div className="h-4 w-32 bg-gray-800 rounded mb-3" />
          <div className="h-20 bg-gray-800 rounded" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error || 'Market not found'}
        </div>
        <Link to="/" className="text-cyan-400 hover:text-cyan-300 text-sm mt-4 inline-block">
          Back to markets
        </Link>
      </div>
    );
  }

  const { market, crossPlatform, settlement, priceHistory, metaculus } = data;
  const { save, remove, isSaved: checkSaved } = useSavedMarkets();
  const saved = platform && id ? checkSaved(id, platform) : false;
  const yesPrice =
    market.prices['Yes'] ?? market.prices['yes'] ?? Object.values(market.prices)[0] ?? 0.5;

  const closeDate = market.closeDate
    ? new Date(market.closeDate).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link to="/" className="text-cyan-400 hover:text-cyan-300 text-sm mb-4 inline-block">
        &larr; Back to markets
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h1 className="text-2xl font-bold text-white">{market.question}</h1>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() =>
                saved
                  ? remove(market.id, market.platform)
                  : save({ id: market.id, platform: market.platform, question: market.question, yesPrice })
              }
              className={`px-3 py-1 rounded border text-xs transition-colors ${
                saved
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-gray-800 text-gray-400 border-gray-700 hover:text-white'
              }`}
            >
              {saved ? 'Saved' : 'Save'}
            </button>
          <span
            className={`text-xs px-2 py-1 rounded border shrink-0 ${
              market.platform === 'polymarket'
                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
            }`}
          >
            {market.platform === 'polymarket' ? 'Polymarket' : 'Kalshi'}
          </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
          {market.volume != null && market.volume > 0 && <span>Volume: ${Math.round(market.volume).toLocaleString()}</span>}
          {market.liquidity != null && market.liquidity > 0 && <span>Liquidity: ${Math.round(market.liquidity).toLocaleString()}</span>}
          {closeDate && <span>Closes: {closeDate}</span>}
          {market.platform === 'polymarket' && typeof (market.metadata as Record<string, unknown>)?.slug === 'string' && (
            <a
              href={`https://polymarket.com/event/${(market.metadata as Record<string, string>).slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-500 hover:text-cyan-400"
            >
              View on Polymarket &rarr;
            </a>
          )}
          {market.platform === 'kalshi' && (
            <a
              href={`https://kalshi.com/markets/${market.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-500 hover:text-cyan-400"
            >
              View on Kalshi &rarr;
            </a>
          )}
        </div>
      </div>

      {/* Current Odds */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">Current Odds</h2>
        <PriceBar yesPrice={yesPrice} />
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>Yes</span>
          <span>No</span>
        </div>
      </div>

      {/* Price History */}
      {priceHistory && priceHistory.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Price History (7d)</h2>
          <PriceChart history={priceHistory} />
        </div>
      )}

      {/* Cross-Platform Comparison */}
      {crossPlatform?.matchedMarket && (
        <div className="mb-6">
          <CrossPlatformComparison
            currentPlatform={market.platform}
            currentPrices={market.prices}
            matchedPlatform={crossPlatform.matchedPlatform}
            matchedPrices={crossPlatform.matchedMarket.prices}
            confidence={crossPlatform.confidence}
            settlement={settlement || undefined}
          />
        </div>
      )}

      {/* Metaculus Superforecaster Prediction */}
      {metaculus && (
        <div className="mb-6">
          <MetaculusPrediction
            prediction={metaculus.prediction}
            marketPrice={metaculus.marketPrice}
            title={metaculus.title}
          />
        </div>
      )}

      {/* Log Forecast */}
      <div className="mb-6">
        <ForecastLogger
          marketId={market.id}
          platform={market.platform}
          question={market.question}
          currentPrice={yesPrice}
          category={(market.metadata as Record<string, unknown>)?.category as string}
        />
      </div>

      {/* AI Research Brief */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-400 mb-3">AI Research Brief</h2>
        <ResearchBrief
          platform={market.platform}
          marketId={market.id}
          hasMetaculus={!!metaculus}
          hasCrossPlatform={!!crossPlatform?.matchedMarket}
        />
      </div>
    </div>
  );
}

function ForecastLogger({
  marketId,
  platform,
  question,
  currentPrice,
  category,
}: {
  marketId: string;
  platform: string;
  question: string;
  currentPrice: number;
  category?: string;
}) {
  const [probability, setProbability] = useState(Math.round(currentPrice * 100));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  const submit = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/calibration/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketId,
          platform,
          marketQuestion: question,
          forecastProbability: probability / 100,
          marketPrice: currentPrice,
          category: category || undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSubmitted(true);
    } catch {
      setError('Failed to log forecast');
    }
  }, [marketId, platform, question, probability, currentPrice, category]);

  if (submitted) {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-green-400 text-sm">
        Forecast logged: {probability}% YES. Track your accuracy on the{' '}
        <Link to="/calibration" className="underline">Calibration</Link> page.
      </div>
    );
  }

  return (
    <div className="border border-gray-800 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">Log Your Forecast</h3>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <input
            type="range"
            min={1}
            max={99}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1%</span>
            <span className="text-cyan-400 font-medium text-sm">{probability}% YES</span>
            <span>99%</span>
          </div>
        </div>
        <button
          onClick={submit}
          className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-sm font-medium transition-colors shrink-0"
        >
          Log Forecast
        </button>
      </div>
      {error && <div className="text-red-400 text-xs mt-2">{error}</div>}
      <div className="text-xs text-gray-600 mt-2">
        Market is at {(currentPrice * 100).toFixed(0)}%. What do you think?
      </div>
    </div>
  );
}
