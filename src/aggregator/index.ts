/**
 * Aggregator Module
 *
 * Public exports for opportunity aggregation and deduplication.
 *
 * @module aggregator
 */

export {
  OpportunityAggregator,
  AggregationResult,
  AggregationError,
  AggregationStats,
  AggregatorConfig,
} from './opportunity-aggregator.js';

export {
  OpportunityDeduplicator,
  DedupStats,
} from './deduplicator.js';
