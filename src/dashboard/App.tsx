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
}

/**
 * Main dashboard application component
 */
export function App({ bankroll, minScore, watchMode, refreshInterval }: AppProps) {
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
  }, [bankroll, minScore, dbInitialized]);

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
