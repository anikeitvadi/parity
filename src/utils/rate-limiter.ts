import { backOff } from 'exponential-backoff';
import { logger } from './logger.js';

interface RateLimitError extends Error {
  status?: number;
  code?: string;
}

/**
 * Rate limiter with sliding window and exponential backoff.
 * Enforces rate limits and handles retry logic for API calls.
 */
export class RateLimiter {
  private lastRequest = 0;
  private requestCount = 0;
  private windowStart = Date.now();
  private name: string;

  constructor(
    private maxRequestsPerWindow: number,
    private windowMs: number,
    private minDelayMs: number,
    name = 'default'
  ) {
    this.name = name;
  }

  /**
   * Execute a function with rate limiting and exponential backoff.
   * Automatically retries on rate limit (429) and network errors (ECONNRESET).
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check sliding window rate limit
    const now = Date.now();
    if (now - this.windowStart >= this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitMs = this.windowMs - (now - this.windowStart);
      logger.debug(
        { limiter: this.name, waitMs, requestCount: this.requestCount },
        'Rate limit reached, waiting'
      );
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.execute(fn);
    }

    // Enforce minimum delay between requests
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minDelayMs) {
      const delayMs = this.minDelayMs - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    this.requestCount++;
    this.lastRequest = Date.now();

    // Execute with exponential backoff
    return backOff(() => fn(), {
      numOfAttempts: 5,
      startingDelay: 1000,
      timeMultiple: 2,
      maxDelay: 30000,
      jitter: 'full', // Add randomness to prevent thundering herd
      retry: (error: RateLimitError, attemptNumber: number) => {
        // Retry on rate limit or network errors
        const shouldRetry = error.status === 429 || error.code === 'ECONNRESET';
        if (shouldRetry) {
          logger.warn(
            { limiter: this.name, attemptNumber, error: error.message },
            'Retrying after error'
          );
        }
        return shouldRetry;
      },
    });
  }

  /**
   * Get current rate limiter statistics
   */
  getStats() {
    return {
      name: this.name,
      requestsInWindow: this.requestCount,
      maxRequestsPerWindow: this.maxRequestsPerWindow,
      windowMs: this.windowMs,
      minDelayMs: this.minDelayMs,
    };
  }
}

/**
 * Create rate limiter for Polymarket API.
 * Uses 50% safety margin: 30 requests/minute (documented limit is 60/min).
 * Minimum 1 second between requests.
 */
export function createPolymarketLimiter(): RateLimiter {
  return new RateLimiter(
    30, // 30 requests per minute (50% of 60)
    60_000, // 1 minute window
    1_000, // 1 second minimum delay between requests
    'polymarket'
  );
}

/**
 * Create rate limiter for Kalshi API.
 * Uses 50% safety margin: 10 requests/second (documented Basic tier is 20/sec).
 * Minimum 100ms between requests.
 */
export function createKalshiLimiter(): RateLimiter {
  return new RateLimiter(
    10, // 10 requests per second (50% of 20)
    1_000, // 1 second window
    100, // 100ms minimum delay
    'kalshi'
  );
}
