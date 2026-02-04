/**
 * Metaculus Client Service Tests
 *
 * Unit tests for Metaculus API client (mocked - no real API calls)
 * Updated for Metaculus API v2 (/posts/ endpoint)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetaculusClient } from '../../src/services/metaculus-client.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('MetaculusClient', () => {
  let client: MetaculusClient;
  const mockToken = 'test-token-12345';

  // Sample mock post data (new API format)
  const mockPost = {
    id: 12345,
    title: 'Will Bitcoin reach $100k by end of 2026?',
    created_at: '2024-01-01T00:00:00Z',
    status: 'open',
    nr_forecasters: 50,
    question: {
      id: 12300,
      title: 'Will Bitcoin reach $100k by end of 2026?',
      type: 'binary',
      status: 'open',
      scheduled_resolve_time: '2026-12-31T23:59:59Z',
      scheduled_close_time: '2026-12-31T23:59:59Z',
      description: 'Question resolves YES if Bitcoin closes above $100,000.',
      resolution_criteria: 'Resolves YES if Bitcoin > $100k',
      aggregations: {
        recency_weighted: {
          history: [],
          latest: {
            centers: [0.65],
            forecaster_count: 50,
            end_time: 1717243200, // Unix timestamp
          },
        },
      },
    },
  };

  // Mock post without forecasts
  const mockPostNoForecasts = {
    id: 99999,
    title: 'New question without forecasts',
    created_at: '2024-06-01T00:00:00Z',
    status: 'open',
    nr_forecasters: 0,
    question: {
      id: 99900,
      title: 'New question without forecasts',
      type: 'binary',
      status: 'open',
      scheduled_resolve_time: '2026-12-31T23:59:59Z',
      description: 'A new question',
      aggregations: {
        recency_weighted: {
          history: [],
          latest: null,
        },
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock axios.create to return a mock instance
    const mockAxiosInstance = {
      get: vi.fn(),
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn(), eject: vi.fn() },
        response: { use: vi.fn(), eject: vi.fn() },
      },
    };

    (axios.create as any) = vi.fn(() => mockAxiosInstance);

    client = new MetaculusClient(mockToken);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should throw error if no token provided and METACULUS_TOKEN not set', () => {
      const originalEnv = process.env.METACULUS_TOKEN;
      delete process.env.METACULUS_TOKEN;

      expect(() => new MetaculusClient()).toThrow(
        /Metaculus API token required/
      );

      // Restore environment
      if (originalEnv) {
        process.env.METACULUS_TOKEN = originalEnv;
      }
    });

    it('should create client with provided token', () => {
      const testClient = new MetaculusClient('custom-token');
      expect(testClient).toBeInstanceOf(MetaculusClient);
    });

    it('should create client with METACULUS_TOKEN env var', () => {
      const originalEnv = process.env.METACULUS_TOKEN;
      process.env.METACULUS_TOKEN = 'env-token-123';

      const testClient = new MetaculusClient();
      expect(testClient).toBeInstanceOf(MetaculusClient);

      // Restore environment
      if (originalEnv) {
        process.env.METACULUS_TOKEN = originalEnv;
      } else {
        delete process.env.METACULUS_TOKEN;
      }
    });

    it('should configure axios with correct baseURL and headers', () => {
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'https://www.metaculus.com/api',
          timeout: 30000,
          headers: {
            Authorization: `Token ${mockToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
    });
  });

  describe('getQuestionByUrl', () => {
    it('should extract ID correctly from valid URL', async () => {
      const url = 'https://www.metaculus.com/questions/12345/';
      const mockGet = vi.fn().mockResolvedValue({ data: mockPost });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      // Now uses /posts/ endpoint
      expect(mockGet).toHaveBeenCalledWith('/posts/12345/');
    });

    it('should extract ID from URL without trailing slash', async () => {
      const url = 'https://www.metaculus.com/questions/67890';
      const mockGet = vi.fn().mockResolvedValue({ data: { ...mockPost, id: 67890 } });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      expect(mockGet).toHaveBeenCalledWith('/posts/67890/');
    });

    it('should extract ID from URL with additional path segments', async () => {
      const url = 'https://www.metaculus.com/questions/12345/bitcoin-price';
      const mockGet = vi.fn().mockResolvedValue({ data: mockPost });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      expect(mockGet).toHaveBeenCalledWith('/posts/12345/');
    });

    it('should throw on invalid URL format', async () => {
      const invalidUrl = 'https://www.metaculus.com/invalid/path';

      await expect(client.getQuestionByUrl(invalidUrl)).rejects.toThrow(
        /Invalid Metaculus question URL format/
      );
    });

    it('should throw on URL without question ID', async () => {
      const invalidUrl = 'https://www.metaculus.com/questions/';

      await expect(client.getQuestionByUrl(invalidUrl)).rejects.toThrow(
        /Invalid Metaculus question URL format/
      );
    });
  });

  describe('searchQuestions', () => {
    it('should return parsed questions from API response', async () => {
      const mockResponse = {
        data: {
          results: [mockPost],
          count: 1,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.searchQuestions();

      // Should transform post to MetaculusQuestion format
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockPost.question.id);
      expect(result[0].title).toBe(mockPost.question.title);
      expect(result[0].type).toBe('binary');

      // Now uses /posts/ endpoint
      expect(mockGet).toHaveBeenCalledWith(
        '/posts/',
        expect.objectContaining({
          params: expect.objectContaining({
            limit: 100,
            offset: 0,
            status: 'open',
            order_by: '-activity',
          }),
        })
      );
    });

    it('should use custom search parameters', async () => {
      const mockResponse = {
        data: {
          results: [mockPost],
          count: 1,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      await client.searchQuestions({
        limit: 50,
        offset: 10,
        status: 'closed',
        forecast_type: 'binary',
        order_by: '-resolve_time',
      });

      expect(mockGet).toHaveBeenCalledWith(
        '/posts/',
        expect.objectContaining({
          params: {
            limit: 50,
            offset: 10,
            status: 'closed',
            forecast_type: 'binary',
            order_by: '-resolve_time',
          },
        })
      );
    });

    it('should return empty array when results array is empty', async () => {
      const mockResponse = {
        data: {
          results: [],
          count: 0,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.searchQuestions();

      expect(result).toEqual([]);
    });

    it('should skip posts without questions (e.g., notebooks)', async () => {
      const notebookPost = {
        id: 111,
        title: 'Notebook',
        created_at: '2024-01-01T00:00:00Z',
        status: 'open',
        nr_forecasters: 0,
        question: null, // No question - this is a notebook
      };

      const mockResponse = {
        data: {
          results: [mockPost, notebookPost],
          count: 2,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.searchQuestions();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe(mockPost.question.title);
    });

    it('should skip unsupported question types', async () => {
      const conditionalPost = {
        ...mockPost,
        id: 222,
        question: {
          ...mockPost.question,
          id: 220,
          type: 'conditional', // Unsupported type
        },
      };

      const mockResponse = {
        data: {
          results: [mockPost, conditionalPost],
          count: 2,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.searchQuestions();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockPost.question.id);
    });
  });

  describe('getQuestion', () => {
    it('should return question with community prediction from post API', async () => {
      const mockResponse = {
        data: mockPost,
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(12345);

      expect(result.id).toBe(mockPost.question.id);
      expect(result.title).toBe(mockPost.question.title);
      expect(result.type).toBe('binary');
      expect(result.community_prediction).toBeDefined();
      expect(result.community_prediction?.q2).toBe(0.65);
      expect(mockGet).toHaveBeenCalledWith('/posts/12345/');
    });

    it('should return question without prediction when none available', async () => {
      const mockResponse = {
        data: mockPostNoForecasts,
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(99999);

      expect(result.id).toBe(mockPostNoForecasts.question.id);
      expect(result.community_prediction).toBeUndefined();
    });

    it('should throw error when post has no question', async () => {
      const mockResponse = {
        data: {
          id: 123,
          title: 'A notebook',
          created_at: '2024-01-01T00:00:00Z',
          status: 'open',
          question: null,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      await expect(client.getQuestion(123)).rejects.toThrow(
        /does not contain a question/
      );
    });

    it('should throw error on invalid response schema', async () => {
      const invalidResponse = {
        data: {
          id: 123,
          // Missing required fields
        },
      };

      const mockGet = vi.fn().mockResolvedValue(invalidResponse);
      (client as any).client.get = mockGet;

      await expect(client.getQuestion(123)).rejects.toThrow(
        /Invalid Metaculus question response schema/
      );
    });
  });

  describe('Response Validation', () => {
    it('should accept questions without predictions', async () => {
      const mockResponse = { data: mockPostNoForecasts };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(99999);

      expect(result.community_prediction).toBeUndefined();
    });

    it('should accept different question types', async () => {
      const numericPost = {
        ...mockPost,
        question: {
          ...mockPost.question,
          type: 'numeric',
        },
      };

      const mockResponse = { data: numericPost };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(12345);

      expect(result.type).toBe('numeric');
    });

    it('should extract prediction timestamp correctly', async () => {
      const mockResponse = { data: mockPost };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(12345);

      expect(result.community_prediction).toBeDefined();
      expect(result.community_prediction?.timestamp).toBeDefined();
      // Timestamp should be ISO string
      expect(new Date(result.community_prediction!.timestamp).getTime()).toBeGreaterThan(0);
    });
  });

  describe('searchQuestionsWithForecasts', () => {
    it('should fetch individual questions to get forecast data', async () => {
      const searchResponse = {
        data: {
          results: [mockPost, mockPostNoForecasts],
          count: 2,
        },
      };

      const mockGet = vi.fn()
        .mockResolvedValueOnce(searchResponse) // First call: search
        .mockResolvedValueOnce({ data: mockPost }) // Second call: fetch post 12345
        .mockResolvedValueOnce({ data: mockPostNoForecasts }); // Third call: fetch post 99999

      (client as any).client.get = mockGet;

      const result = await client.searchQuestionsWithForecasts({ limit: 10 }, 2);

      expect(result).toHaveLength(2);
      // First question should have forecast
      expect(result[0].community_prediction).toBeDefined();
      expect(result[0].community_prediction?.q2).toBe(0.65);
      // Second question should not have forecast
      expect(result[1].community_prediction).toBeUndefined();
    });

    it('should respect maxToFetch limit', async () => {
      const searchResponse = {
        data: {
          results: [mockPost, mockPostNoForecasts, { ...mockPost, id: 333 }],
          count: 3,
        },
      };

      const mockGet = vi.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ data: mockPost });

      (client as any).client.get = mockGet;

      const result = await client.searchQuestionsWithForecasts({ limit: 10 }, 1);

      expect(result).toHaveLength(1);
      // Should only make 2 calls: 1 search + 1 individual fetch
      expect(mockGet).toHaveBeenCalledTimes(2);
    });
  });
});
