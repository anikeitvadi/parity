/**
 * OpportunityTable Component
 *
 * Interactive table display for scored opportunities using Ink Select.
 * Supports keyboard navigation and selection.
 *
 * Requirements:
 * - CLI-01: Display opportunities in table format
 * - CLI-02: Score-based color coding (7+ green, 5-6 yellow, <5 dim)
 * - CLI-03: Arrow key navigation, Enter for details
 *
 * @module dashboard/components/OpportunityTable
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Select } from '@inkjs/ui';
import type { ScoredOpportunity } from '../../scoring/types.js';

interface OpportunityTableProps {
  opportunities: ScoredOpportunity[];
  onSelect: (id: string) => void;
}

/**
 * Format a row for display in the select menu
 */
function formatRow(opp: ScoredOpportunity): string {
  const score = opp.score.toFixed(1).padStart(5);
  const market = opp.marketQuestion.slice(0, 40).padEnd(40);
  const edge = ((opp.netEdge * 100).toFixed(1) + '%').padStart(7);
  const type = opp.type.slice(0, 12).padStart(12);
  const size = ('$' + opp.positionSize.toFixed(0)).padStart(8);
  return `${score}  ${market}  ${edge}  ${type}  ${size}`;
}

/**
 * Score-colored text component
 */
function ScoreIndicator({ score }: { score: number }) {
  if (score >= 7) {
    return <Text color="green" bold>{score.toFixed(1)}</Text>;
  }
  if (score >= 5) {
    return <Text color="yellow">{score.toFixed(1)}</Text>;
  }
  return <Text dimColor>{score.toFixed(1)}</Text>;
}

/**
 * Interactive table for browsing scored opportunities
 */
export function OpportunityTable({ opportunities, onSelect }: OpportunityTableProps) {
  if (opportunities.length === 0) {
    return (
      <Box flexDirection="column" paddingY={1}>
        <Text color="yellow">No opportunities above threshold</Text>
        <Text dimColor>Press 'r' to refresh or adjust --min-score flag</Text>
      </Box>
    );
  }

  const options = opportunities.map((opp) => ({
    label: formatRow(opp),
    value: opp.id,
  }));

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} paddingX={1}>
        <Text bold color="cyan">{'SCORE'.padEnd(7)}</Text>
        <Text bold color="cyan">{'MARKET'.padEnd(42)}</Text>
        <Text bold color="cyan">{'EDGE'.padStart(9)}</Text>
        <Text bold color="cyan">{'TYPE'.padStart(14)}</Text>
        <Text bold color="cyan">{'SIZE'.padStart(10)}</Text>
      </Box>
      <Select options={options} onChange={onSelect} />
      <Box marginTop={1}>
        <Text dimColor>Use arrow keys to navigate, Enter to view details</Text>
      </Box>
    </Box>
  );
}

export { ScoreIndicator };
