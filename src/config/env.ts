import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Environment variable schema with validation.
 * All required variables must be set for the application to start.
 */
const envSchema = z.object({
  // Runtime environment
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  // Polymarket configuration
  // Private key for CLOB authentication (64+ hex characters without 0x prefix, or 66 with)
  POLYMARKET_PRIVATE_KEY: z
    .string()
    .min(64, 'POLYMARKET_PRIVATE_KEY must be at least 64 characters (hex private key)')
    .describe('Ethereum private key for Polymarket CLOB authentication'),

  // Optional: Polymarket API key for Gamma API (if required)
  POLYMARKET_API_KEY: z.string().optional(),

  // Optional: Polymarket profile/funder address
  POLYMARKET_FUNDER_ADDRESS: z.string().optional(),

  // Kalshi configuration
  // Get credentials from: Kalshi Dashboard -> Settings -> API Keys
  KALSHI_API_KEY: z
    .string()
    .min(10, 'KALSHI_API_KEY must be at least 10 characters')
    .describe('Kalshi API key for market data access'),
  KALSHI_API_SECRET: z
    .string()
    .min(10, 'KALSHI_API_SECRET must be at least 10 characters')
    .describe('Kalshi API secret for authentication'),

  // Optional: Use demo API instead of production
  KALSHI_USE_DEMO: z
    .string()
    .optional()
    .transform((val) => val === 'true'),
});

// Parse and validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parseResult.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\nRequired environment variables:');
  console.error('  POLYMARKET_PRIVATE_KEY: Ethereum private key (64+ hex chars)');
  console.error('  KALSHI_API_KEY: Kalshi API key (from Dashboard -> Settings -> API Keys)');
  console.error('  KALSHI_API_SECRET: Kalshi API secret');
  console.error('\nOptional environment variables:');
  console.error('  NODE_ENV: development | production (default: development)');
  console.error('  POLYMARKET_API_KEY: Gamma API key (if required)');
  console.error('  POLYMARKET_FUNDER_ADDRESS: Polymarket profile address');
  console.error('  KALSHI_USE_DEMO: Set to "true" to use demo API');
  process.exit(1);
}

/**
 * Validated environment configuration.
 * Import this in other modules to access environment variables with type safety.
 */
export const env = parseResult.data;

// Type for the environment configuration
export type Env = z.infer<typeof envSchema>;
