/**
 * Dashboard App Component
 *
 * Main entry point for the CLI dashboard. Orchestrates data fetching,
 * scoring, and rendering of opportunity list and detail views.
 *
 * Features:
 * - Real-time opportunity aggregation and scoring
 * - Interactive navigation between list and detail views
 * - Watch mode with configurable refresh interval
 * - Keyboard shortcuts for navigation and refresh
 *
 * Requirements:
 * - CLI-01: Display opportunities in table format
 * - CLI-02: Score-based highlighting
 * - CLI-03: Interactive navigation
 * - CLI-04: Watch mode
 *
 * @module dashboard/App
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import { Spinner } from '@inkjs/ui';
import { OpportunityTable } from './components/OpportunityTable.js';
import { OpportunityDetail } from './components/OpportunityDetail.js';
import { StatusBar } from './components/StatusBar.js';
import { OpportunityAggregator } from '../aggregator/opportunity-aggregator.js';
import { OpportunityDeduplicator } from '../aggregator/deduplicator.js';
import { scoreOpportunity } from '../scoring/index.js';
import { initDatabase } from '../database/schema.js';
import type { ScoredOpportunity } from '../scoring/types.js';

/**
 * Props for the App component
 */
export interface AppProps {
  /** Total bankroll for position sizing calculations */
  bankroll: number;
  /** Minimum score threshold for displaying opportunities */
  minScore: number;
  /** Enable watch mode with auto-refresh */
  watchMode: boolean;
  /** Refresh interval in milliseconds */
  refreshInterval: number;
  /** Enable demo mode with fake opportunities */
  demo?: boolean;
}

/**
 * Generate demo opportunities for testing the UI
 */
function generateDemoOpportunities(bankroll: number): ScoredOpportunity[] {
  const now = Date.now();
  const closeDate = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();

  return [
    {
      id: 'demo-1',
      type: 'cross_platform',
      platform: 'cross',
      marketId: 'demo-trump-tariffs',
      marketQuestion: 'Will the US impose reciprocal tariffs on EU by July 2026?',
      grossEdge: 0.12,
      netEdge: 0.10,
      detectorConfidence: 0.85,
      matchConfidence: 0.92,
      minLiquidity: 15000,
      liquidityDepth: 3,
      detectedAt: now,
      closeDate,
      raw: { demo: true },
      score: 8.2,
      scoreBreakdown: {
        edgeScore: 8.5,
        confidenceScore: 8.5,
        liquidityScore: 7.5,
        timeScore: 8.0,
        profitScore: 8.0,
        weights: { edgeSize: 0.35, confidence: 0.25, liquidity: 0.20, timeToResolution: 0.10, feeAdjustedProfit: 0.10 },
      },
      positionSize: bankroll * 0.08,
      positionPercent: 8,
    },
    {
      id: 'demo-2',
      type: 'multi_outcome',
      platform: 'polymarket',
      marketId: 'demo-fed-rate',
      marketQuestion: 'What will the Fed funds rate be after March FOMC?',
      grossEdge: 0.08,
      netEdge: 0.06,
      detectorConfidence: 0.78,
      minLiquidity: 8500,
      liquidityDepth: 4,
      detectedAt: now - 5 * 60 * 1000,
      closeDate,
      raw: { demo: true },
      score: 6.8,
      scoreBreakdown: {
        edgeScore: 7.0,
        confidenceScore: 7.8,
        liquidityScore: 6.5,
        timeScore: 6.0,
        profitScore: 6.5,
        weights: { edgeSize: 0.35, confidence: 0.25, liquidity: 0.20, timeToResolution: 0.10, feeAdjustedProfit: 0.10 },
      },
      positionSize: bankroll * 0.05,
      positionPercent: 5,
    },
    {
      id: 'demo-3',
      type: 'metaculus_divergence',
      platform: 'kalshi',
      marketId: 'demo-ai-benchmark',
      marketQuestion: 'Will GPT-5 score 95%+ on GPQA Diamond by September 2026?',
      grossEdge: 0.15,
      netEdge: 0.12,
      detectorConfidence: 0.72,
      minLiquidity: 5000,
      liquidityDepth: 2,
      detectedAt: now - 15 * 60 * 1000,
      closeDate: new Date(now + 120 * 24 * 60 * 60 * 1000).toISOString(),
      raw: { demo: true },
      score: 7.5,
      scoreBreakdown: {
        edgeScore: 9.0,
        confidenceScore: 7.2,
        liquidityScore: 5.5,
        timeScore: 7.0,
        profitScore: 8.5,
        weights: { edgeSize: 0.35, confidence: 0.25, liquidity: 0.20, timeToResolution: 0.10, feeAdjustedProfit: 0.10 },
      },
      positionSize: bankroll * 0.06,
      positionPercent: 6,
    },
    {
      id: 'demo-4',
      type: 'correlated',
      platform: 'polymarket',
      marketId: 'demo-btc-etf',
      marketQuestion: 'Bitcoin ETF daily inflow > $500M this week?',
      grossEdge: 0.05,
      netEdge: 0.03,
      detectorConfidence: 0.65,
      minLiquidity: 3200,
      liquidityDepth: 2,
      detectedAt: now - 25 * 60 * 1000,
      closeDate: new Date(now + 5 * 24 * 60 * 60 * 1000).toISOString(),
      raw: { demo: true },
      score: 4.2,
      scoreBreakdown: {
        edgeScore: 4.5,
        confidenceScore: 6.5,
        liquidityScore: 4.0,
        timeScore: 3.5,
        profitScore: 3.5,
        weights: { edgeSize: 0.35, confidence: 0.25, liquidity: 0.20, timeToResolution: 0.10, feeAdjustedProfit: 0.10 },
      },
      positionSize: bankroll * 0.02,
      positionPercent: 2,
    },
  ];
}

/**
 * Main dashboard application component
 */
export function App({ bankroll, minScore, watchMode, refreshInterval, demo = false }: AppProps) {
  const { exit } = useApp();

  // State
  const [opportunities, setOpportunities] = useState<ScoredOpportunity[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [errorCount, setErrorCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbInitialized, setDbInitialized] = useState(false);

  // Refs for stable references
  const aggregatorRef = useRef<OpportunityAggregator | null>(null);
  const deduplicatorRef = useRef<OpportunityDeduplicator | null>(null);

  // Initialize database, aggregator, and deduplicator
  useEffect(() => {
    try {
      initDatabase();
      setDbInitialized(true);
    } catch (err) {
      setError(`Database init failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    aggregatorRef.current = new OpportunityAggregator();
    deduplicatorRef.current = new OpportunityDeduplicator();
    return () => {
      aggregatorRef.current = null;
      deduplicatorRef.current = null;
    };
  }, []);

  /**
   * Refresh opportunities from aggregator
   */
  const refresh = useCallback(async () => {
    // Demo mode: use fake data
    if (demo) {
      setIsLoading(true);
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 500));
      const demoOpps = generateDemoOpportunities(bankroll).filter(
        (o) => o.score >= minScore
      );
      setOpportunities(demoOpps);
      setLastUpdate(new Date());
      setErrorCount(0);
      setIsLoading(false);
      return;
    }

    if (!aggregatorRef.current || !deduplicatorRef.current || !dbInitialized) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await aggregatorRef.current.aggregate();
      setErrorCount(result.errors.length);

      // Score and filter opportunities
      const scored: ScoredOpportunity[] = [];
      for (const opp of result.opportunities) {
        const scoredOpp = scoreOpportunity(opp, bankroll);
        if (scoredOpp && scoredOpp.score >= minScore) {
          // Check for duplicates (only show new or updated opportunities)
          if (!deduplicatorRef.current.isDuplicate(opp)) {
            deduplicatorRef.current.record(opp, scoredOpp.score);
            scored.push(scoredOpp);
          }
        }
      }

      // Sort by score descending
      scored.sort((a, b) => b.score - a.score);
      setOpportunities(scored);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setErrorCount((prev) => prev + 1);
    } finally {
      setIsLoading(false);
    }
  }, [bankroll, minScore, dbInitialized, demo]);

  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Watch mode polling
  useEffect(() => {
    if (!watchMode) return;
    const timer = setInterval(refresh, refreshInterval);
    return () => clearInterval(timer);
  }, [watchMode, refreshInterval, refresh]);

  // Keyboard navigation
  useInput((input, key) => {
    // Quit
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }

    // Back from detail view
    if (selectedId && (input === 'b' || key.escape)) {
      setSelectedId(null);
      return;
    }

    // Refresh
    if (input === 'r') {
      refresh();
      return;
    }
  });

  // Get selected opportunity
  const selectedOpp = selectedId
    ? opportunities.find((o) => o.id === selectedId)
    : null;

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Header */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          PREDICTION MARKET EDGE SCANNER
        </Text>
        {demo && <Text color="yellow"> [DEMO MODE]</Text>}
        {watchMode && (
          <Text dimColor> (watching every {refreshInterval / 1000}s)</Text>
        )}
      </Box>

      {/* Error display */}
      {error && (
        <Box marginBottom={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      {/* Main content */}
      {isLoading && !lastUpdate ? (
        <Box paddingY={1}>
          <Spinner label="Loading opportunities..." />
        </Box>
      ) : selectedOpp ? (
        <OpportunityDetail
          opportunity={selectedOpp}
          onBack={() => setSelectedId(null)}
        />
      ) : (
        <OpportunityTable
          opportunities={opportunities}
          onSelect={setSelectedId}
        />
      )}

      {/* Status bar */}
      <Box marginTop={1}>
        <StatusBar
          lastUpdate={lastUpdate}
          opportunityCount={opportunities.length}
          errorCount={errorCount}
          isLoading={isLoading}
          watchMode={watchMode}
          refreshInterval={refreshInterval / 1000}
        />
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text dimColor>
          q: quit | r: refresh
          {selectedId ? ' | b: back to list' : ' | Enter: view details'}
        </Text>
      </Box>
    </Box>
  );
}
