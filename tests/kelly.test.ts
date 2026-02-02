/**
 * Kelly Criterion Position Sizing Tests
 *
 * Test cases for SIZE-01 through SIZE-04 requirements:
 * - SIZE-01: Kelly criterion calculates optimal position size
 * - SIZE-02: Inputs (edge, confidence, bankroll)
 * - SIZE-03: Half-Kelly is default (fraction = 0.5)
 * - SIZE-04: 10% bankroll cap enforced (maxPosition = 0.10)
 */

import { describe, it, expect } from 'vitest';
import { calculateKelly, KellyInput, KellyOutput } from '../src/scoring/kelly.js';

describe('Kelly Criterion Position Sizing', () => {
  describe('Standard Calculations', () => {
    it('calculates position size with 10% edge and 0.8 confidence', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.10 * 0.80 = 0.08 (8%)
      // Half Kelly: 0.08 * 0.5 = 0.04 (4%)
      // Position: $500 * 0.04 = $20.00
      expect(result.positionSize).toBe(20);
      expect(result.positionPercent).toBe(4);
      expect(result.cappedBy).toBe('none');
    });

    it('calculates position size with 10% edge and 0.9 confidence', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.10 * 0.90 = 0.09 (9%)
      // Half Kelly: 0.09 * 0.5 = 0.045 (4.5%)
      // Position: $500 * 0.045 = $22.50
      expect(result.positionSize).toBe(22.50);
      expect(result.positionPercent).toBe(4.5);
      expect(result.cappedBy).toBe('none');
    });

    it('calculates position size with 20% edge and 0.8 confidence', () => {
      const input: KellyInput = {
        edge: 0.20,
        confidence: 0.80,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.20 * 0.80 = 0.16 (16%)
      // Half Kelly: 0.16 * 0.5 = 0.08 (8%)
      // Position: $500 * 0.08 = $40.00
      expect(result.positionSize).toBe(40);
      expect(result.positionPercent).toBe(8);
      expect(result.cappedBy).toBe('none');
    });

    it('calculates position size with 3% edge and 0.5 confidence (low edge)', () => {
      const input: KellyInput = {
        edge: 0.03,
        confidence: 0.50,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.03 * 0.50 = 0.015 (1.5%)
      // Half Kelly: 0.015 * 0.5 = 0.0075 (0.75%)
      // Position: $500 * 0.0075 = $3.75
      expect(result.positionSize).toBe(3.75);
      expect(result.positionPercent).toBe(0.75);
      expect(result.cappedBy).toBe('none');
    });
  });

  describe('10% Bankroll Cap (SIZE-04)', () => {
    it('caps position at 10% for high edge scenarios', () => {
      const input: KellyInput = {
        edge: 0.25,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.25 * 0.90 = 0.225 (22.5%)
      // Half Kelly: 0.225 * 0.5 = 0.1125 (11.25%)
      // Capped to 10% = $50.00
      expect(result.positionSize).toBe(50);
      expect(result.positionPercent).toBe(10);
      expect(result.cappedBy).toBe('max');
    });

    it('caps position at 10% for 30% edge and 0.9 confidence', () => {
      const input: KellyInput = {
        edge: 0.30,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.30 * 0.90 = 0.27 (27%)
      // Half Kelly: 0.27 * 0.5 = 0.135 (13.5%)
      // Capped to 10% = $50.00
      expect(result.positionSize).toBe(50);
      expect(result.positionPercent).toBe(10);
      expect(result.cappedBy).toBe('max');
    });

    it('caps very high edge (50%) at 10%', () => {
      const input: KellyInput = {
        edge: 0.50,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.50 * 0.90 = 0.45 (45%)
      // Half Kelly: 0.45 * 0.5 = 0.225 (22.5%)
      // Capped to 10% = $50.00
      expect(result.positionSize).toBe(50);
      expect(result.positionPercent).toBe(10);
      expect(result.cappedBy).toBe('max');
    });
  });

  describe('Edge Cases', () => {
    it('returns 0 for zero edge', () => {
      const input: KellyInput = {
        edge: 0,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      expect(result.positionSize).toBe(0);
      expect(result.positionPercent).toBe(0);
      expect(result.cappedBy).toBe('kelly');
    });

    it('returns 0 for negative edge', () => {
      const input: KellyInput = {
        edge: -0.05,
        confidence: 0.90,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      expect(result.positionSize).toBe(0);
      expect(result.positionPercent).toBe(0);
      expect(result.cappedBy).toBe('kelly');
    });

    it('returns 0 for very low confidence (<0.1)', () => {
      const input: KellyInput = {
        edge: 0.20,
        confidence: 0.05,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      expect(result.positionSize).toBe(0);
      expect(result.positionPercent).toBe(0);
      expect(result.cappedBy).toBe('kelly');
    });

    it('returns 0 for confidence exactly at 0.1 threshold', () => {
      // Confidence < 0.1 returns 0, so 0.1 should work
      const input: KellyInput = {
        edge: 0.20,
        confidence: 0.10,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.20 * 0.10 = 0.02 (2%)
      // Half Kelly: 0.02 * 0.5 = 0.01 (1%)
      // Position: $500 * 0.01 = $5.00
      expect(result.positionSize).toBe(5);
      expect(result.positionPercent).toBe(1);
      expect(result.cappedBy).toBe('none');
    });

    it('returns 0 for confidence just below 0.1 threshold', () => {
      const input: KellyInput = {
        edge: 0.20,
        confidence: 0.099,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      expect(result.positionSize).toBe(0);
      expect(result.positionPercent).toBe(0);
      expect(result.cappedBy).toBe('kelly');
    });

    it('handles zero bankroll', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 0,
      };

      const result = calculateKelly(input);

      expect(result.positionSize).toBe(0);
      expect(result.positionPercent).toBe(4);
      expect(result.cappedBy).toBe('none');
    });

    it('rounds position size to cents', () => {
      const input: KellyInput = {
        edge: 0.073,
        confidence: 0.85,
        bankroll: 500,
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.073 * 0.85 = 0.06205
      // Half Kelly: 0.06205 * 0.5 = 0.031025
      // Position: $500 * 0.031025 = $15.5125 -> rounded to $15.51
      expect(result.positionSize).toBe(15.51);
      expect(typeof result.positionSize).toBe('number');
      expect(result.positionSize.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
    });
  });

  describe('Configurable Parameters', () => {
    it('uses custom fraction (quarter-Kelly)', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 500,
        fraction: 0.25, // Quarter-Kelly
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.10 * 0.80 = 0.08 (8%)
      // Quarter Kelly: 0.08 * 0.25 = 0.02 (2%)
      // Position: $500 * 0.02 = $10.00
      expect(result.positionSize).toBe(10);
      expect(result.positionPercent).toBe(2);
      expect(result.cappedBy).toBe('none');
    });

    it('uses custom fraction (full Kelly)', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 500,
        fraction: 1.0, // Full Kelly
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.10 * 0.80 = 0.08 (8%)
      // Position: $500 * 0.08 = $40.00
      expect(result.positionSize).toBe(40);
      expect(result.positionPercent).toBe(8);
      expect(result.cappedBy).toBe('none');
    });

    it('uses custom maxPosition cap (5%)', () => {
      const input: KellyInput = {
        edge: 0.20,
        confidence: 0.80,
        bankroll: 500,
        maxPosition: 0.05, // 5% cap
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.20 * 0.80 = 0.16 (16%)
      // Half Kelly: 0.16 * 0.5 = 0.08 (8%)
      // Capped to 5% = $25.00
      expect(result.positionSize).toBe(25);
      expect(result.positionPercent).toBe(5);
      expect(result.cappedBy).toBe('max');
    });

    it('uses custom maxPosition cap (15%)', () => {
      const input: KellyInput = {
        edge: 0.40,
        confidence: 0.80,
        bankroll: 500,
        maxPosition: 0.15, // 15% cap
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.40 * 0.80 = 0.32 (32%)
      // Half Kelly: 0.32 * 0.5 = 0.16 (16%)
      // Capped to 15% = $75.00
      expect(result.positionSize).toBe(75);
      expect(result.positionPercent).toBe(15);
      expect(result.cappedBy).toBe('max');
    });

    it('combines custom fraction and custom cap', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 500,
        fraction: 0.25,   // Quarter-Kelly
        maxPosition: 0.01, // 1% cap
      };

      const result = calculateKelly(input);

      // Full Kelly: 0.10 * 0.80 = 0.08 (8%)
      // Quarter Kelly: 0.08 * 0.25 = 0.02 (2%)
      // Capped to 1% = $5.00
      expect(result.positionSize).toBe(5);
      expect(result.positionPercent).toBe(1);
      expect(result.cappedBy).toBe('max');
    });
  });

  describe('Different Bankroll Sizes', () => {
    it('calculates correctly for $1000 bankroll', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 1000,
      };

      const result = calculateKelly(input);

      // Half Kelly: 4%
      // Position: $1000 * 0.04 = $40.00
      expect(result.positionSize).toBe(40);
      expect(result.positionPercent).toBe(4);
    });

    it('calculates correctly for $100 bankroll', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 100,
      };

      const result = calculateKelly(input);

      // Half Kelly: 4%
      // Position: $100 * 0.04 = $4.00
      expect(result.positionSize).toBe(4);
      expect(result.positionPercent).toBe(4);
    });

    it('calculates correctly for large bankroll ($50000)', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 50000,
      };

      const result = calculateKelly(input);

      // Half Kelly: 4%
      // Position: $50000 * 0.04 = $2000.00
      expect(result.positionSize).toBe(2000);
      expect(result.positionPercent).toBe(4);
    });
  });

  describe('Type Exports', () => {
    it('exports KellyInput interface', () => {
      const input: KellyInput = {
        edge: 0.10,
        confidence: 0.80,
        bankroll: 500,
      };
      expect(input).toBeDefined();
    });

    it('exports KellyOutput interface', () => {
      const output: KellyOutput = {
        positionSize: 20,
        positionPercent: 4,
        cappedBy: 'none',
      };
      expect(output).toBeDefined();
    });
  });
});
