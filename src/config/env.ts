import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env in development
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

/**
 * Environment variable schema with validation.
 *
 * DEMO_MODE=true allows running without API credentials for testing.
 * In demo mode, only public APIs (Polymarket Gamma) will work.
 */
const envSchema = z.object({
  // Runtime environment
  NODE_ENV: z.enum(['development', 'production']).default('development'),

  // Demo mode - run without API credentials (public data only)
  DEMO_MODE: z
    .string()
    .optional()
    .transform((val) => val === 'true'),

  // Polymarket configuration
  // Private key for CLOB authentication (64+ hex characters without 0x prefix, or 66 with)
  // Optional in demo mode
  POLYMARKET_PRIVATE_KEY: z
    .string()
    .min(64, 'POLYMARKET_PRIVATE_KEY must be at least 64 characters (hex private key)')
    .optional(),

  // Optional: Polymarket API key for Gamma API (if required)
  POLYMARKET_API_KEY: z.string().optional(),

  // Optional: Polymarket profile/funder address
  POLYMARKET_FUNDER_ADDRESS: z.string().optional(),

  // Kalshi configuration - optional in demo mode
  // Get credentials from: Kalshi Dashboard -> Settings -> API Keys
  KALSHI_API_KEY: z
    .string()
    .min(10, 'KALSHI_API_KEY must be at least 10 characters')
    .optional(),
  KALSHI_API_SECRET: z
    .string()
    .min(10, 'KALSHI_API_SECRET must be at least 10 characters')
    .optional(),
  // Use demo API instead of production
  KALSHI_USE_DEMO: z
    .string()
    .optional()
    .transform((val) => val === 'true'),

  // OpenAI API key for AI research briefs (optional)
  OPENAI_API_KEY: z.string().optional(),

  // xAI API key for Grok + real-time X/Twitter data (optional, preferred over OpenAI)
  // Free credits at console.x.ai
  XAI_API_KEY: z.string().optional(),

  // Web server port (default: 3001)
  PORT: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 3001)),
}).refine(
  (data) => {
    // In demo mode, credentials are optional
    if (data.DEMO_MODE) return true;
    // Otherwise, require Polymarket key at minimum
    return !!data.POLYMARKET_PRIVATE_KEY;
  },
  {
    message: 'POLYMARKET_PRIVATE_KEY required (or set DEMO_MODE=true for public data only)',
    path: ['POLYMARKET_PRIVATE_KEY'],
  }
);

// Parse and validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parseResult.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('\n🚀 Quick start (demo mode - no API keys needed):');
  console.error('  echo "DEMO_MODE=true" > .env');
  console.error('\nFull configuration:');
  console.error('  DEMO_MODE=true              # Run with public data only (no trading)');
  console.error('  POLYMARKET_PRIVATE_KEY      # Ethereum private key (64+ hex chars)');
  console.error('  KALSHI_API_KEY              # Kalshi API key');
  console.error('  KALSHI_API_SECRET           # Kalshi API secret');
  process.exit(1);
}

/**
 * Validated environment configuration.
 * Import this in other modules to access environment variables with type safety.
 */
export const env = parseResult.data;

// Type for the environment configuration
export type Env = z.infer<typeof envSchema>;
