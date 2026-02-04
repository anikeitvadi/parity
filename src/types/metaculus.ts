/**
 * Metaculus API types for superforecaster integration
 *
 * @module types/metaculus
 */

import { z } from 'zod';

/**
 * Metaculus question type
 */
export type MetaculusQuestionType = 'binary' | 'numeric' | 'multiple_choice' | 'date';

/**
 * Metaculus question status
 */
export type MetaculusQuestionStatus = 'open' | 'closed' | 'resolved';

/**
 * Metaculus prediction (community or pro)
 */
export interface MetaculusPrediction {
  /** Median prediction (0-1 for binary questions) */
  q2: number;
  /** Timestamp of prediction */
  timestamp: string;
}

/**
 * Zod schema for Metaculus API question response
 */
export const MetaculusQuestionSchema = z.object({
  /** Unique question identifier */
  id: z.number(),
  /** Question title */
  title: z.string(),
  /** Question description/details */
  description: z.string(),
  /** Question type */
  type: z.enum(['binary', 'numeric', 'multiple_choice', 'date']),
  /** Creation timestamp (ISO 8601) */
  created_time: z.string(),
  /** Resolution timestamp (ISO 8601) */
  resolve_time: z.string(),
  /** Current question status */
  status: z.enum(['open', 'closed', 'resolved']),
  /** Community prediction (may not be available for all questions) */
  community_prediction: z.object({
    q2: z.number().min(0).max(1),
    timestamp: z.string(),
  }).optional(),
  /** Pro prediction (superforecaster consensus, may not be available) */
  pro_prediction: z.object({
    q2: z.number().min(0).max(1),
    timestamp: z.string(),
  }).optional(),
});

/**
 * Metaculus question from API
 */
export type MetaculusQuestion = z.infer<typeof MetaculusQuestionSchema>;

/**
 * Match method for Metaculus-to-market pairing
 */
export type MatchMethod = 'exact' | 'high_similarity' | 'manual';

/**
 * Matched pair of Metaculus question and prediction market
 */
export interface MetaculusMatch {
  /** Metaculus question ID */
  metaculusId: number;
  /** Metaculus question title */
  metaculusTitle: string;
  /** Platform (polymarket or kalshi) */
  platform: 'polymarket' | 'kalshi';
  /** Market ID on the platform */
  marketId: string;
  /** Market question text */
  marketQuestion: string;
  /** Match confidence score (0-1) */
  matchConfidence: number;
  /** How the match was determined */
  matchMethod: MatchMethod;
  /** Timestamp when match was created */
  matchedAt: number;
  /** Manual verification flag */
  verified?: boolean;
}

/**
 * Forecast staleness assessment
 */
export interface ForecastStaleness {
  /** Whether forecast is fresh enough for reliable use */
  isFresh: boolean;
  /** Age of forecast in days */
  daysOld: number;
  /** Last update timestamp */
  lastUpdate: Date;
  /** Warning message if stale */
  warning?: string;
}

/**
 * Metaculus divergence opportunity detected
 *
 * Represents a situation where superforecaster consensus significantly
 * differs from market price, suggesting potential mispricing.
 */
export interface MetaculusDivergenceOpportunity {
  /** Opportunity type discriminator */
  type: 'metaculus_divergence';
  /** Metaculus question ID */
  metaculusId: number;
  /** Metaculus question title */
  metaculusTitle: string;
  /** Market ID on platform */
  marketId: string;
  /** Market platform */
  marketPlatform: 'polymarket' | 'kalshi';
  /** Market question text */
  marketQuestion: string;
  /** Metaculus prediction (0-1 probability) */
  metaculusPrediction: number;
  /** Current market price (0-1 probability) */
  marketPrice: number;
  /** Divergence as percentage (absolute value) */
  divergencePercent: number;
  /** Match confidence between question and market */
  matchConfidence: number;
  /** Forecast timestamp (ISO 8601) */
  forecastTimestamp: string;
  /** Age of forecast in days */
  forecastAge: number;
  /** Whether forecast is fresh */
  isFresh: boolean;
  /** Staleness warning if applicable */
  stalenessWarning?: string;
  /** Detection timestamp (Unix seconds) */
  detectedAt: number;
}
