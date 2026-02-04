/**
 * Settlement comparison view for cross-platform arbitrage opportunities.
 *
 * Displays side-by-side comparison of settlement rules between platforms,
 * similarity scores, and risk factors.
 *
 * @module dashboard/components/SettlementView
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { SettlementComparison, SettlementCriteria } from '../../types/settlement.js';

interface SettlementViewProps {
  comparison: SettlementComparison;
  polyCriteria?: SettlementCriteria;
  kalshiCriteria?: SettlementCriteria;
}

/**
 * Format similarity score as colored percentage.
 */
function SimilarityScore({ label, value }: { label: string; value: number }) {
  const percent = (value * 100).toFixed(0);
  let color: string;

  if (value >= 0.9) {
    color = 'green';
  } else if (value >= 0.7) {
    color = 'yellow';
  } else {
    color = 'red';
  }

  return (
    <Box>
      <Text>{label}: </Text>
      <Text color={color} bold>{percent}%</Text>
    </Box>
  );
}

/**
 * Display a single platform's settlement criteria.
 */
function PlatformCriteria({
  platform,
  criteria,
}: {
  platform: 'Polymarket' | 'Kalshi';
  criteria?: SettlementCriteria;
}) {
  if (!criteria) {
    return (
      <Box flexDirection="column" width="50%">
        <Text color="cyan" bold>{platform}</Text>
        <Text color="gray">No criteria available</Text>
      </Box>
    );
  }

  const truncate = (str: string, len: number) =>
    str.length > len ? str.substring(0, len) + '...' : str;

  return (
    <Box flexDirection="column" width="50%" paddingRight={1}>
      <Text color="cyan" bold>{platform}</Text>
      <Box marginTop={1}>
        <Text color="gray">Question: </Text>
        <Text>{truncate(criteria.question, 60)}</Text>
      </Box>
      <Box>
        <Text color="gray">Primary Rule: </Text>
        <Text>{truncate(criteria.primaryRule, 80)}</Text>
      </Box>
      {criteria.resolutionDate && (
        <Box>
          <Text color="gray">Resolution: </Text>
          <Text>{criteria.resolutionDate.toLocaleDateString()}</Text>
        </Box>
      )}
      {criteria.dataSource && (
        <Box>
          <Text color="gray">Data Source: </Text>
          <Text color="blue">{criteria.dataSource}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Settlement comparison view component.
 *
 * Shows side-by-side settlement rules, similarity scores, and risk factors
 * for cross-platform arbitrage opportunities.
 */
export function SettlementView({
  comparison,
  polyCriteria,
  kalshiCriteria,
}: SettlementViewProps) {
  const { similarity, safeForArbitrage, riskFactors, manualOverride } = comparison;

  return (
    <Box flexDirection="column" borderStyle="single" padding={1}>
      <Box marginBottom={1}>
        <Text color="magenta" bold>Settlement Rule Comparison</Text>
      </Box>

      {/* Safety Status */}
      <Box marginBottom={1}>
        <Text>Status: </Text>
        {safeForArbitrage ? (
          <Text color="green" bold>SAFE FOR ARBITRAGE</Text>
        ) : (
          <Text color="red" bold>NOT SAFE - Settlement Mismatch</Text>
        )}
        {manualOverride && (
          <Text color="yellow"> (Manual override: {manualOverride})</Text>
        )}
      </Box>

      {/* Similarity Scores */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="white" bold>Similarity Scores</Text>
        <Box>
          <Box width="50%">
            <SimilarityScore label="Question" value={similarity.question} />
          </Box>
          <Box width="50%">
            <SimilarityScore label="Criteria" value={similarity.criteria} />
          </Box>
        </Box>
        <Box>
          <Box width="50%">
            <SimilarityScore label="Timing" value={similarity.timing} />
          </Box>
          <Box width="50%">
            <SimilarityScore label="Data Source" value={similarity.dataSource} />
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text>Overall Confidence: </Text>
          <Text
            color={similarity.overall >= 0.9 ? 'green' : similarity.overall >= 0.7 ? 'yellow' : 'red'}
            bold
          >
            {(similarity.overall * 100).toFixed(0)}%
          </Text>
        </Box>
      </Box>

      {/* Risk Factors */}
      {riskFactors.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text color="yellow" bold>Risk Factors</Text>
          {riskFactors.map((risk, i) => (
            <Box key={i}>
              <Text color="yellow">  - {risk}</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Side-by-side Criteria */}
      <Box flexDirection="column">
        <Text color="white" bold>Settlement Rules</Text>
        <Box marginTop={1}>
          <PlatformCriteria platform="Polymarket" criteria={polyCriteria} />
          <PlatformCriteria platform="Kalshi" criteria={kalshiCriteria} />
        </Box>
      </Box>

      {/* Manual Override Hint */}
      <Box marginTop={1}>
        <Text color="gray" dimColor>
          Press 'o' to toggle manual override | Press 'n' to add notes
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Compact settlement badge for table rows.
 */
export function SettlementBadge({ comparison }: { comparison?: SettlementComparison }) {
  if (!comparison) {
    return <Text color="gray">N/A</Text>;
  }

  const { safeForArbitrage, similarity, manualOverride } = comparison;

  if (manualOverride === 'safe') {
    return <Text color="green">SAFE*</Text>;
  }

  if (manualOverride === 'unsafe') {
    return <Text color="red">UNSAFE*</Text>;
  }

  if (safeForArbitrage) {
    return (
      <Text color="green">
        {(similarity.overall * 100).toFixed(0)}%
      </Text>
    );
  }

  return (
    <Text color="red">
      {(similarity.overall * 100).toFixed(0)}%
    </Text>
  );
}
