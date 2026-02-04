/**
 * Metaculus Client Service Tests
 *
 * Unit tests for Metaculus API client (mocked - no real API calls)
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MetaculusClient } from '../../src/services/metaculus-client.js';
import type { MetaculusQuestion } from '../../src/types/metaculus.js';
import axios from 'axios';

// Mock axios
vi.mock('axios');

describe('MetaculusClient', () => {
  let client: MetaculusClient;
  const mockToken = 'test-token-12345';

  // Sample mock question data
  const mockQuestion: MetaculusQuestion = {
    id: 12345,
    title: 'Will Bitcoin reach $100k by end of 2026?',
    description: 'Question resolves YES if Bitcoin closes above $100,000 on December 31, 2026.',
    type: 'binary',
    created_time: '2024-01-01T00:00:00Z',
    resolve_time: '2026-12-31T23:59:59Z',
    status: 'open',
    community_prediction: {
      q2: 0.65,
      timestamp: '2024-06-01T12:00:00Z',
    },
    pro_prediction: {
      q2: 0.72,
      timestamp: '2024-06-01T12:00:00Z',
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
      const mockGet = vi.fn().mockResolvedValue({ data: mockQuestion });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      expect(mockGet).toHaveBeenCalledWith('/questions/12345/');
    });

    it('should extract ID from URL without trailing slash', async () => {
      const url = 'https://www.metaculus.com/questions/67890';
      const mockGet = vi.fn().mockResolvedValue({ data: mockQuestion });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      expect(mockGet).toHaveBeenCalledWith('/questions/67890/');
    });

    it('should extract ID from URL with additional path segments', async () => {
      const url = 'https://www.metaculus.com/questions/12345/bitcoin-price';
      const mockGet = vi.fn().mockResolvedValue({ data: mockQuestion });
      (client as any).client.get = mockGet;

      await client.getQuestionByUrl(url);

      expect(mockGet).toHaveBeenCalledWith('/questions/12345/');
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
          results: [mockQuestion],
          count: 1,
        },
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.searchQuestions();

      expect(result).toEqual([mockQuestion]);
      expect(mockGet).toHaveBeenCalledWith(
        '/questions/',
        expect.objectContaining({
          params: expect.objectContaining({
            limit: 100,
            offset: 0,
            status: 'open',
            order_by: '-created_time',
          }),
        })
      );
    });

    it('should use custom search parameters', async () => {
      const mockResponse = {
        data: {
          results: [mockQuestion],
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
        '/questions/',
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

    it('should throw error on invalid response schema', async () => {
      const invalidResponse = {
        data: {
          results: [
            {
              // Missing required fields
              id: 123,
            },
          ],
        },
      };

      const mockGet = vi.fn().mockResolvedValue(invalidResponse);
      (client as any).client.get = mockGet;

      await expect(client.searchQuestions()).rejects.toThrow(
        /Invalid Metaculus API response schema/
      );
    });
  });

  describe('getQuestion', () => {
    it('should return single question from API', async () => {
      const mockResponse = {
        data: mockQuestion,
      };

      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(12345);

      expect(result).toEqual(mockQuestion);
      expect(mockGet).toHaveBeenCalledWith('/questions/12345/');
    });

    it('should throw error on invalid question response', async () => {
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

    it('should validate response against schema', async () => {
      const validQuestion: MetaculusQuestion = {
        id: 999,
        title: 'Test Question',
        description: 'Test description',
        type: 'binary',
        created_time: '2024-01-01T00:00:00Z',
        resolve_time: '2024-12-31T23:59:59Z',
        status: 'open',
        community_prediction: {
          q2: 0.5,
          timestamp: '2024-06-01T00:00:00Z',
        },
      };

      const mockResponse = { data: validQuestion };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(999);

      expect(result).toEqual(validQuestion);
    });
  });

  describe('Response Validation', () => {
    it('should accept questions without predictions', async () => {
      const questionWithoutPredictions: MetaculusQuestion = {
        id: 111,
        title: 'New Question',
        description: 'Just created',
        type: 'binary',
        created_time: '2024-01-01T00:00:00Z',
        resolve_time: '2024-12-31T23:59:59Z',
        status: 'open',
        // No predictions yet
      };

      const mockResponse = { data: questionWithoutPredictions };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(111);

      expect(result).toEqual(questionWithoutPredictions);
      expect(result.community_prediction).toBeUndefined();
      expect(result.pro_prediction).toBeUndefined();
    });

    it('should accept different question types', async () => {
      const numericQuestion: MetaculusQuestion = {
        id: 222,
        title: 'What will be the temperature?',
        description: 'Numeric forecast',
        type: 'numeric',
        created_time: '2024-01-01T00:00:00Z',
        resolve_time: '2024-12-31T23:59:59Z',
        status: 'open',
      };

      const mockResponse = { data: numericQuestion };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      const result = await client.getQuestion(222);

      expect(result.type).toBe('numeric');
    });

    it('should enforce prediction value bounds (0-1)', async () => {
      const invalidPrediction = {
        id: 333,
        title: 'Test',
        description: 'Test',
        type: 'binary',
        created_time: '2024-01-01T00:00:00Z',
        resolve_time: '2024-12-31T23:59:59Z',
        status: 'open',
        community_prediction: {
          q2: 1.5, // Invalid: greater than 1
          timestamp: '2024-06-01T00:00:00Z',
        },
      };

      const mockResponse = { data: invalidPrediction };
      const mockGet = vi.fn().mockResolvedValue(mockResponse);
      (client as any).client.get = mockGet;

      await expect(client.getQuestion(333)).rejects.toThrow(
        /Invalid Metaculus question response schema/
      );
    });
  });
});
