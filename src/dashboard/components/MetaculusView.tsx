/**
 * Metaculus divergence view for dashboard.
 *
 * Displays Metaculus superforecaster prediction vs market price,
 * with staleness color coding to help assess forecast freshness.
 *
 * @module dashboard/components/MetaculusView
 */

import React from 'react';
import { Box, Text } from 'ink';

interface MetaculusViewProps {
  metaculusId: number;
  metaculusTitle: string;
  metaculusPrediction: number;
  marketPrice: number;
  divergencePercent: number;
  forecastTimestamp: string;
  forecastAge: number;
  isFresh: boolean;
  stalenessWarning?: string;
  matchConfidence: number;
}

/**
 * Get staleness color based on forecast age.
 * - Green: Fresh (< 7 days)
 * - Yellow: Getting stale (7-14 days)
 * - Red: Stale (> 14 days)
 */
function getStalenessColor(isFresh: boolean, forecastAge: number): string {
  if (isFresh) {
    return 'green';
  }
  if (forecastAge > 14) {
    return 'red';
  }
  return 'yellow';
}

/**
 * Format confidence as colored percentage.
 */
function ConfidenceBadge({ value }: { value: number }) {
  const percent = (value * 100).toFixed(0);
  let color: string;

  if (value >= 0.9) {
    color = 'green';
  } else if (value >= 0.8) {
    color = 'yellow';
  } else {
    color = 'red';
  }

  return <Text color={color}>{percent}%</Text>;
}

/**
 * Metaculus divergence view component.
 *
 * Shows side-by-side comparison of Metaculus superforecaster prediction
 * vs market price, along with staleness indicators.
 */
export function MetaculusView({
  metaculusId,
  metaculusTitle,
  metaculusPrediction,
  marketPrice,
  divergencePercent,
  forecastTimestamp,
  forecastAge,
  isFresh,
  stalenessWarning,
  matchConfidence,
}: MetaculusViewProps) {
  const stalenessColor = getStalenessColor(isFresh, forecastAge);

  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Box marginBottom={1}>
        <Text color="magenta" bold>Metaculus Divergence</Text>
      </Box>

      {/* Question Title */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="cyan">Question: </Text>
        <Box paddingLeft={2}>
          <Text>{metaculusTitle}</Text>
        </Box>
      </Box>

      {/* Metaculus ID */}
      <Box marginBottom={1}>
        <Text color="cyan">Metaculus ID: </Text>
        <Text>{metaculusId}</Text>
        <Text dimColor> (</Text>
        <Text color="blue">https://metaculus.com/questions/{metaculusId}</Text>
        <Text dimColor>)</Text>
      </Box>

      {/* Prediction Comparison */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>Prediction Comparison</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Metaculus:  </Text>
            <Text bold color="cyan">{(metaculusPrediction * 100).toFixed(1)}%</Text>
          </Box>
          <Box>
            <Text>Market:     </Text>
            <Text bold>{(marketPrice * 100).toFixed(1)}%</Text>
          </Box>
          <Box marginTop={1}>
            <Text>Divergence: </Text>
            <Text bold color="yellow">{divergencePercent.toFixed(1)}%</Text>
            {divergencePercent >= 10 && (
              <Text color="green"> (significant edge)</Text>
            )}
          </Box>
        </Box>
      </Box>

      {/* Forecast Freshness */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>Forecast Freshness</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Age: </Text>
            <Text color={stalenessColor} bold>{forecastAge} days</Text>
            {!isFresh && (
              <Text color="yellow"> (stale)</Text>
            )}
          </Box>
          {stalenessWarning && (
            <Box>
              <Text color="yellow">Warning: {stalenessWarning}</Text>
            </Box>
          )}
          <Box>
            <Text dimColor>Last updated: {new Date(forecastTimestamp).toLocaleDateString()}</Text>
          </Box>
        </Box>
      </Box>

      {/* Match Confidence */}
      <Box marginBottom={1}>
        <Text>Match Confidence: </Text>
        <ConfidenceBadge value={matchConfidence} />
        {matchConfidence < 0.9 && (
          <Text dimColor> (verify question alignment)</Text>
        )}
      </Box>

      {/* Staleness Legend */}
      <Box marginTop={1}>
        <Text dimColor>
          Staleness: <Text color="green">Fresh (&lt;7d)</Text>
          {' | '}
          <Text color="yellow">Aging (7-14d)</Text>
          {' | '}
          <Text color="red">Stale (&gt;14d)</Text>
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Compact Metaculus badge for table rows.
 */
export function MetaculusBadge({
  divergencePercent,
  isFresh,
  forecastAge,
}: {
  divergencePercent: number;
  isFresh: boolean;
  forecastAge: number;
}) {
  const stalenessColor = getStalenessColor(isFresh, forecastAge);

  return (
    <Box>
      <Text color="yellow">{divergencePercent.toFixed(0)}%</Text>
      <Text color={stalenessColor}> ({forecastAge}d)</Text>
    </Box>
  );
}
