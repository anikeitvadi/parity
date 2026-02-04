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
 * Zod schema for Metaculus API search response
 */
const MetaculusSearchResponseSchema = z.object({
  results: z.array(MetaculusQuestionSchema),
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
   * @param params - Search parameters (limit, offset, status, etc.)
   * @returns Array of Metaculus questions matching search criteria
   */
  async searchQuestions(params?: MetaculusSearchParams): Promise<MetaculusQuestion[]> {
    const searchParams = {
      limit: params?.limit ?? 100,
      offset: params?.offset ?? 0,
      status: params?.status ?? 'open',
      ...(params?.forecast_type && { forecast_type: params.forecast_type }),
      order_by: params?.order_by ?? '-created_time',
    };

    try {
      this.log.debug({ params: searchParams }, 'Searching Metaculus questions');

      const response = await this.client.get('/questions/', {
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

      const questions = parseResult.data.results || [];

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
   * Get a specific Metaculus question by ID
   *
   * @param id - Question ID
   * @returns Metaculus question data
   */
  async getQuestion(id: number): Promise<MetaculusQuestion> {
    try {
      this.log.debug({ questionId: id }, 'Fetching Metaculus question');

      const response = await this.client.get(`/questions/${id}/`);

      // Validate response with Zod
      const parseResult = MetaculusQuestionSchema.safeParse(response.data);

      if (!parseResult.success) {
        this.log.error(
          { questionId: id, error: parseResult.error.message },
          'Invalid Metaculus question response'
        );
        throw new Error('Invalid Metaculus question response schema');
      }

      this.log.debug({ questionId: id }, 'Successfully fetched Metaculus question');

      return parseResult.data;
    } catch (error) {
      this.log.error(
        {
          error: isAxiosError(error)
            ? { message: error.message, status: error.response?.status }
            : error,
          questionId: id,
        },
        'Failed to fetch Metaculus question'
      );
      throw error;
    }
  }

  /**
   * Get a Metaculus question by URL
   *
   * Extracts the question ID from the URL and fetches the question.
   *
   * @param url - Metaculus question URL (e.g., https://www.metaculus.com/questions/12345/)
   * @returns Metaculus question data
   * @throws Error if URL format is invalid
   */
  async getQuestionByUrl(url: string): Promise<MetaculusQuestion> {
    // Extract ID from URL pattern: /questions/(\d+)/
    const match = url.match(/\/questions\/(\d+)\/?/);

    if (!match || !match[1]) {
      throw new Error(
        `Invalid Metaculus question URL format: ${url}. Expected format: https://www.metaculus.com/questions/{id}/`
      );
    }

    const questionId = parseInt(match[1], 10);

    this.log.debug({ url, questionId }, 'Extracted question ID from URL');

    return this.getQuestion(questionId);
  }
}
