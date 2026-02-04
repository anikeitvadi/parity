/**
 * OpportunityDetail Component
 *
 * Detailed view of a single scored opportunity.
 * Shows score breakdown, position sizing, and market metadata.
 *
 * Requirements:
 * - CLI-03: Enter shows detail view with reasoning and risks
 * - CLI-04: Display position size recommendation
 *
 * @module dashboard/components/OpportunityDetail
 */

import React from 'react';
import { Box, Text, Newline } from 'ink';
import type { ScoredOpportunity } from '../../scoring/types.js';
import { SettlementView } from './SettlementView.js';
import { getSettlementComparison } from '../../database/queries.js';
import type { SettlementComparison } from '../../types/settlement.js';

interface OpportunityDetailProps {
  opportunity: ScoredOpportunity;
  onBack: () => void;
}

/**
 * Score-colored text component
 */
function ScoreText({ score }: { score: number }) {
  if (score >= 7) {
    return <Text color="green" bold>{score.toFixed(1)}</Text>;
  }
  if (score >= 5) {
    return <Text color="yellow">{score.toFixed(1)}</Text>;
  }
  return <Text dimColor>{score.toFixed(1)}</Text>;
}

/**
 * Format the opportunity type for display
 */
function formatType(type: string): string {
  const typeMap: Record<string, string> = {
    multi_outcome: 'Multi-Outcome Mispricing',
    correlated: 'Correlated Market Discrepancy',
    cross_platform: 'Cross-Platform Arbitrage',
  };
  return typeMap[type] || type;
}

/**
 * Get settlement comparison for cross-platform opportunities
 */
function getSettlementForOpportunity(opportunity: ScoredOpportunity): SettlementComparison | null {
  if (opportunity.type !== 'cross_platform') {
    return null;
  }

  // Extract market IDs from raw detector output
  const raw = opportunity.raw as {
    polymarket_id?: string;
    kalshi_ticker?: string;
    polymarketId?: string;
    kalshiTicker?: string;
  } | null;

  if (!raw) {
    return null;
  }

  const polyId = raw.polymarket_id || raw.polymarketId;
  const kalshiId = raw.kalshi_ticker || raw.kalshiTicker;

  if (!polyId || !kalshiId) {
    return null;
  }

  return getSettlementComparison(polyId, kalshiId);
}

/**
 * Detailed view of a single opportunity
 */
export function OpportunityDetail({ opportunity, onBack }: OpportunityDetailProps) {
  const breakdown = opportunity.scoreBreakdown;
  const settlementComparison = getSettlementForOpportunity(opportunity);

  return (
    <Box flexDirection="column" paddingX={2} paddingY={1}>
      {/* Header */}
      <Box borderStyle="single" borderColor="cyan" paddingX={2} paddingY={1}>
        <Text bold>{opportunity.marketQuestion}</Text>
      </Box>

      <Newline />

      {/* Score Section */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">SCORE ANALYSIS</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Composite Score: </Text>
            <ScoreText score={opportunity.score} />
            <Text> / 10</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>Breakdown:</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            <Box>
              <Text>Edge Factor:       </Text>
              <Text>{breakdown.edgeScore.toFixed(1)}</Text>
              <Text dimColor> (weight: {(breakdown.weights.edgeSize * 100).toFixed(0)}%)</Text>
            </Box>
            <Box>
              <Text>Confidence Factor: </Text>
              <Text>{breakdown.confidenceScore.toFixed(1)}</Text>
              <Text dimColor> (weight: {(breakdown.weights.confidence * 100).toFixed(0)}%)</Text>
            </Box>
            <Box>
              <Text>Liquidity Factor:  </Text>
              <Text>{breakdown.liquidityScore.toFixed(1)}</Text>
              <Text dimColor> (weight: {(breakdown.weights.liquidity * 100).toFixed(0)}%)</Text>
            </Box>
            <Box>
              <Text>Time Factor:       </Text>
              <Text>{breakdown.timeScore.toFixed(1)}</Text>
              <Text dimColor> (weight: {(breakdown.weights.timeToResolution * 100).toFixed(0)}%)</Text>
            </Box>
            <Box>
              <Text>Profit Factor:     </Text>
              <Text>{breakdown.profitScore.toFixed(1)}</Text>
              <Text dimColor> (weight: {(breakdown.weights.feeAdjustedProfit * 100).toFixed(0)}%)</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Edge Analysis */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">EDGE ANALYSIS</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Gross Edge: </Text>
            <Text color="green">{(opportunity.grossEdge * 100).toFixed(1)}%</Text>
          </Box>
          <Box>
            <Text>Net Edge:   </Text>
            <Text color="green" bold>{(opportunity.netEdge * 100).toFixed(1)}%</Text>
            <Text dimColor> (after fees)</Text>
          </Box>
        </Box>
      </Box>

      {/* Market Details */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">MARKET DETAILS</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Type:     </Text>
            <Text>{formatType(opportunity.type)}</Text>
          </Box>
          <Box>
            <Text>Platform: </Text>
            <Text>{opportunity.platform}</Text>
          </Box>
          <Box>
            <Text>Liquidity:</Text>
            <Text> ${opportunity.minLiquidity.toLocaleString()}</Text>
            <Text dimColor> (depth: {opportunity.liquidityDepth} levels)</Text>
          </Box>
          {opportunity.closeDate && (
            <Box>
              <Text>Closes:   </Text>
              <Text>{opportunity.closeDate}</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Settlement Comparison (Cross-Platform only) */}
      {opportunity.type === 'cross_platform' && settlementComparison && (
        <Box marginBottom={1}>
          <SettlementView comparison={settlementComparison} />
        </Box>
      )}

      {/* Position Sizing */}
      <Box flexDirection="column" marginBottom={1}>
        <Text bold color="cyan">RECOMMENDED POSITION</Text>
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text>Position Size: </Text>
            <Text bold color="green">${opportunity.positionSize.toFixed(2)}</Text>
          </Box>
          <Box>
            <Text>% of Bankroll: </Text>
            <Text>{opportunity.positionPercent.toFixed(2)}%</Text>
          </Box>
          <Box marginTop={1}>
            <Text dimColor>
              Based on Kelly Criterion with half-Kelly sizing for safety
            </Text>
          </Box>
        </Box>
      </Box>

      {/* Metadata */}
      <Box flexDirection="column" marginBottom={1}>
        <Text dimColor>Market ID: {opportunity.marketId}</Text>
        <Text dimColor>Detected: {new Date(opportunity.detectedAt).toLocaleString()}</Text>
      </Box>

      {/* Navigation */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text dimColor>Press </Text>
        <Text bold>'b'</Text>
        <Text dimColor> or </Text>
        <Text bold>Escape</Text>
        <Text dimColor> to go back to list</Text>
      </Box>
    </Box>
  );
}
