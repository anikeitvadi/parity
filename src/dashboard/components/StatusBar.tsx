/**
 * StatusBar Component
 *
 * Displays dashboard status including last update time,
 * opportunity count, and error indicators.
 *
 * Requirements:
 * - CLI-01: Show last update time
 * - CLI-04: Visual indicators for loading/error states
 *
 * @module dashboard/components/StatusBar
 */

import React from 'react';
import { Box, Text } from 'ink';

interface StatusBarProps {
  /** Last successful data refresh */
  lastUpdate: Date | null;
  /** Number of opportunities currently displayed */
  opportunityCount: number;
  /** Number of errors from last aggregation */
  errorCount: number;
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Watch mode enabled */
  watchMode?: boolean;
  /** Refresh interval in seconds (for display) */
  refreshInterval?: number;
}

/**
 * Calculate staleness and format time since last update
 */
function formatTimeSince(lastUpdate: Date | null): { text: string; isStale: boolean } {
  if (!lastUpdate) {
    return { text: 'Never', isStale: true };
  }

  const seconds = Math.floor((Date.now() - lastUpdate.getTime()) / 1000);

  if (seconds < 60) {
    return { text: `${seconds}s ago`, isStale: false };
  }

  const minutes = Math.floor(seconds / 60);
  // Stale if older than 30 minutes
  const isStale = minutes > 30;

  if (minutes < 60) {
    return { text: `${minutes}m ago`, isStale };
  }

  const hours = Math.floor(minutes / 60);
  return { text: `${hours}h ago`, isStale: true };
}

/**
 * Status bar showing dashboard state
 */
export function StatusBar({
  lastUpdate,
  opportunityCount,
  errorCount,
  isLoading,
  watchMode,
  refreshInterval,
}: StatusBarProps) {
  const { text: timeText, isStale } = formatTimeSince(lastUpdate);

  return (
    <Box
      borderStyle="single"
      borderColor={isStale ? 'yellow' : 'gray'}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Left section: Status */}
      <Box>
        {isLoading ? (
          <>
            <Text color="cyan">* </Text>
            <Text>Refreshing...</Text>
          </>
        ) : (
          <>
            <Text color="green">+ </Text>
            <Text>{opportunityCount} </Text>
            <Text dimColor>opportunities</Text>
          </>
        )}
      </Box>

      {/* Center section: Last update */}
      <Box>
        <Text dimColor>Updated: </Text>
        <Text color={isStale ? 'yellow' : undefined}>{timeText}</Text>
        {watchMode && refreshInterval && (
          <Text dimColor> (auto-refresh: {refreshInterval}s)</Text>
        )}
      </Box>

      {/* Right section: Errors */}
      <Box>
        {errorCount > 0 ? (
          <>
            <Text color="red">! </Text>
            <Text color="red">{errorCount} errors</Text>
          </>
        ) : (
          <Text dimColor>No errors</Text>
        )}
      </Box>
    </Box>
  );
}
