/**
 * Metaculus API client with rate limiting and exponential backoff
 *
 * @module services/metaculus-client
 */

import axios, { AxiosInstance, isAxiosError } from 'axios';
import axiosRetry from 'axios-retry';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { MetaculusQuestionSchema, type MetaculusQuestion } from '../types/metaculus.js';

/**
 * Metaculus API base URL
 * Note: Metaculus API uses /posts/ endpoint for questions (as of 2025+)
 */
const METACULUS_API_BASE = 'https://www.metaculus.com/api';

/**
 * Search parameters for Metaculus questions
 */
export interface MetaculusSearchParams {
  /** Maximum number of results to return (default: 100) */
  limit?: number;
  /** Offset for pagination (default: 0) */
  offset?: number;
  /** Question status filter (default: 'open') */
  status?: 'open' | 'closed' | 'resolved';
  /** Forecast type filter */
  forecast_type?: 'binary' | 'numeric';
  /** Sort order (default: '-created_time') */
  order_by?: string;
}

/**
 * Zod schema for nested question in post response
 */
const MetaculusPostQuestionSchema = z.object({
  id: z.number(),
  title: z.string(),
  type: z.enum(['binary', 'numeric', 'multiple_choice', 'date', 'group', 'conditional', 'notebook']),
  status: z.enum(['open', 'closed', 'resolved', 'pending', 'upcoming']),
  scheduled_resolve_time: z.string().nullable().optional(),
  scheduled_close_time: z.string().nullable().optional(),
  description: z.string().optional(),
  resolution_criteria: z.string().optional(),
  aggregations: z.object({
    recency_weighted: z.object({
      history: z.array(z.any()).optional(),
      latest: z.object({
        centers: z.array(z.number()),
        forecaster_count: z.number().optional(),
        end_time: z.number().optional(),
      }).nullable().optional(),
    }).optional(),
  }).optional(),
});

/**
 * Zod schema for Metaculus post (contains nested question)
 */
const MetaculusPostSchema = z.object({
  id: z.number(),
  title: z.string(),
  created_at: z.string(),
  status: z.enum(['open', 'closed', 'resolved', 'pending', 'upcoming', 'approved', 'draft']),
  nr_forecasters: z.number().optional(),
  question: MetaculusPostQuestionSchema.nullable().optional(),
});

/**
 * Zod schema for Metaculus API search response (posts endpoint)
 */
const MetaculusSearchResponseSchema = z.object({
  results: z.array(MetaculusPostSchema),
  count: z.number().optional(),
  next: z.string().nullable().optional(),
  previous: z.string().nullable().optional(),
});

/**
 * Metaculus API client
 *
 * Features:
 * - Rate limiting with exponential backoff (5 retries)
 * - Token-based authentication
 * - Automatic retry on 429 (rate limit) and network errors
 * - Zod validation of all API responses
 * - Question search and retrieval methods
 */
export class MetaculusClient {
  private client: AxiosInstance;
  private token: string;
  private log = logger.child({ component: 'metaculus-client' });

  /**
   * Create a new Metaculus API client
   *
   * @param token - API token (defaults to METACULUS_TOKEN env var)
   * @throws Error if no token provided and METACULUS_TOKEN not set
   */
  constructor(token?: string) {
    // Get token from parameter or environment
    const apiToken = token || process.env.METACULUS_TOKEN;

    if (!apiToken) {
      throw new Error(
        'Metaculus API token required. Provide via constructor parameter or METACULUS_TOKEN environment variable.'
      );
    }

    this.token = apiToken;

    // Create axios instance with base configuration
    this.client = axios.create({
      baseURL: METACULUS_API_BASE,
      timeout: 30000, // 30 seconds
      headers: {
        Authorization: `Token ${this.token}`,
        'Content-Type': 'application/json',
      },
    });

    // Configure axios-retry for exponential backoff
    axiosRetry(this.client, {
      retries: 5,
      retryDelay: axiosRetry.exponentialDelay, // Built-in exponential backoff with jitter
      retryCondition: (error) => {
        // Retry on network errors, idempotent request errors, and 429 status
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (isAxiosError(error) && error.response?.status === 429)
        );
      },
      onRetry: (retryCount, error, requestConfig) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        this.log.warn(
          {
            retryCount,
            status,
            url: requestConfig.url,
            method: requestConfig.method,
          },
          'Retrying Metaculus API request'
        );
      },
    });

    this.log.info('Metaculus client initialized');
  }

  /**
   * Search for Metaculus questions
   *
   * Uses the /posts/ endpoint and transforms results to MetaculusQuestion format.
   * Note: The list endpoint doesn't include full aggregation data. Use getQuestion()
   * for individual questions when you need forecast data.
   *
   * @param params - Search parameters (limit, offset, status, etc.)
   * @returns Array of Metaculus questions matching search criteria
   */
  async searchQuestions(params?: MetaculusSearchParams): Promise<MetaculusQuestion[]> {
    const searchParams = {
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
      status: params?.status ?? 'open',
      ...(params?.forecast_type && { forecast_type: params.forecast_type }),
      order_by: params?.order_by ?? '-activity',
    };

    try {
      this.log.debug({ params: searchParams }, 'Searching Metaculus questions');

      // Use /posts/ endpoint (Metaculus API v2)
      const response = await this.client.get('/posts/', {
        params: searchParams,
      });

      // Validate response with Zod
      const parseResult = MetaculusSearchResponseSchema.safeParse(response.data);

      if (!parseResult.success) {
        this.log.error(
          { error: parseResult.error.message },
          'Invalid Metaculus search response'
        );
        throw new Error('Invalid Metaculus API response schema');
      }

      // Transform posts to MetaculusQuestion format
      const questions: MetaculusQuestion[] = [];
      for (const post of parseResult.data.results) {
        // Skip posts without questions (e.g., notebooks)
        if (!post.question) continue;

        // Filter to supported question types
        if (!['binary', 'numeric', 'multiple_choice', 'date'].includes(post.question.type)) {
          continue;
        }

        questions.push({
          id: post.question.id,
          title: post.question.title,
          description: post.question.description || '',
          type: post.question.type as 'binary' | 'numeric' | 'multiple_choice' | 'date',
          created_time: post.created_at,
          resolve_time: post.question.scheduled_resolve_time || '',
          status: post.question.status as 'open' | 'closed' | 'resolved',
          // Note: community_prediction not available in list response
          // Use getQuestion() for individual posts to get forecast data
        });
      }

      this.log.info(
        { count: questions.length, params: searchParams },
        'Successfully fetched Metaculus questions'
      );

      return questions;
    } catch (error) {
      this.log.error(
        {
          error: isAxiosError(error)
            ? { message: error.message, status: error.response?.status, data: error.response?.data }
            : error,
          params: searchParams,
        },
        'Failed to search Metaculus questions'
      );
      throw error;
    }
  }

  /**
   * Get a specific Metaculus question by post ID
   *
   * This method fetches the full post data including aggregations/forecasts.
   *
   * @param id - Post ID (note: this is the post ID, not the nested question ID)
   * @returns Metaculus question data with community prediction
   */
  async getQuestion(id: number): Promise<MetaculusQuestion> {
    try {
      this.log.debug({ postId: id }, 'Fetching Metaculus question');

      // Use /posts/{id}/ endpoint to get full data including aggregations
      const response = await this.client.get(`/posts/${id}/`);

      // Validate response with Zod
      const parseResult = MetaculusPostSchema.safeParse(response.data);

      if (!parseResult.success) {
        this.log.error(
          { postId: id, error: parseResult.error.message },
          'Invalid Metaculus question response'
        );
        throw new Error('Invalid Metaculus question response schema');
      }

      const post = parseResult.data;
      if (!post.question) {
        throw new Error(`Post ${id} does not contain a question`);
      }

      // Extract community prediction from aggregations
      const latest = post.question.aggregations?.recency_weighted?.latest;
      const communityPrediction = latest?.centers?.[0];

      const question: MetaculusQuestion = {
        id: post.question.id,
        title: post.question.title,
        description: post.question.description || '',
        type: post.question.type as 'binary' | 'numeric' | 'multiple_choice' | 'date',
        created_time: post.created_at,
        resolve_time: post.question.scheduled_resolve_time || '',
        status: post.question.status as 'open' | 'closed' | 'resolved',
        ...(communityPrediction !== undefined && {
          community_prediction: {
            q2: communityPrediction,
            timestamp: latest?.end_time
              ? new Date(latest.end_time * 1000).toISOString()
              : post.created_at,
          },
        }),
      };

      this.log.debug(
        { postId: id, hasForecasts: communityPrediction !== undefined },
        'Successfully fetched Metaculus question'
      );

      return question;
    } catch (error) {
      this.log.error(
        {
          error: isAxiosError(error)
            ? { message: error.message, status: error.response?.status }
            : error,
          postId: id,
        },
        'Failed to fetch Metaculus question'
      );
      throw error;
    }
  }

  /**
   * Get a Metaculus question by URL
   *
   * Extracts the post ID from the URL and fetches the question.
   * Note: Metaculus URLs use the post ID, not the nested question ID.
   *
   * @param url - Metaculus question URL (e.g., https://www.metaculus.com/questions/12345/)
   * @returns Metaculus question data
   * @throws Error if URL format is invalid
   */
  async getQuestionByUrl(url: string): Promise<MetaculusQuestion> {
    // Extract ID from URL pattern: /questions/(\d+)/
    // Note: Despite the URL path being /questions/, the ID is actually the post ID
    const match = url.match(/\/questions\/(\d+)\/?/);

    if (!match || !match[1]) {
      throw new Error(
        `Invalid Metaculus question URL format: ${url}. Expected format: https://www.metaculus.com/questions/{id}/`
      );
    }

    const postId = parseInt(match[1], 10);

    this.log.debug({ url, postId }, 'Extracted post ID from URL');

    return this.getQuestion(postId);
  }

  /**
   * Search for questions and fetch full data including forecasts
   *
   * This method first searches for questions matching the criteria, then
   * fetches each question individually to get the forecast data.
   *
   * Note: This makes N+1 API calls (1 search + N individual fetches).
   * Use sparingly and consider caching results.
   *
   * @param params - Search parameters
   * @param maxToFetch - Maximum number of questions to fetch full data for (default: 50)
   * @returns Array of questions with forecast data
   */
  async searchQuestionsWithForecasts(
    params?: MetaculusSearchParams,
    maxToFetch = 50
  ): Promise<MetaculusQuestion[]> {
    // First, search for matching posts
    const searchParams = {
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
      status: params?.status ?? 'open',
      ...(params?.forecast_type && { forecast_type: params.forecast_type }),
      order_by: params?.order_by ?? '-activity',
    };

    try {
      this.log.debug({ params: searchParams }, 'Searching Metaculus questions with forecasts');

      const response = await this.client.get('/posts/', {
        params: searchParams,
      });

      const parseResult = MetaculusSearchResponseSchema.safeParse(response.data);
      if (!parseResult.success) {
        throw new Error('Invalid Metaculus API response schema');
      }

      // Filter to valid questions and limit
      const postsToFetch = parseResult.data.results
        .filter(
          (p) =>
            p.question &&
            ['binary', 'numeric', 'multiple_choice', 'date'].includes(p.question.type)
        )
        .slice(0, maxToFetch);

      this.log.info(
        { searchResults: parseResult.data.results.length, fetching: postsToFetch.length },
        'Fetching individual questions for forecast data'
      );

      // Fetch each question individually to get forecast data
      const questions: MetaculusQuestion[] = [];
      for (const post of postsToFetch) {
        try {
          const question = await this.getQuestion(post.id);
          questions.push(question);
        } catch (err) {
          this.log.warn(
            { postId: post.id, error: err instanceof Error ? err.message : String(err) },
            'Failed to fetch individual question, skipping'
          );
        }
      }

      this.log.info(
        { count: questions.length, withForecasts: questions.filter((q) => q.community_prediction).length },
        'Successfully fetched Metaculus questions with forecasts'
      );

      return questions;
    } catch (error) {
      this.log.error(
        {
          error: isAxiosError(error)
            ? { message: error.message, status: error.response?.status }
            : error,
        },
        'Failed to search Metaculus questions with forecasts'
      );
      throw error;
    }
  }
}
