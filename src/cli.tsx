#!/usr/bin/env node
/**
 * CLI Entry Point
 *
 * Command-line interface for the prediction market edge scanner dashboard.
 * Uses meow for argument parsing and Ink for rendering.
 *
 * Usage:
 *   npm run dashboard                    # Basic usage
 *   npm run dashboard -- --bankroll 1000 # Custom bankroll
 *   npm run dashboard -- --watch         # Enable watch mode
 *   npm run dashboard -- -b 500 -m 5 -w  # Combined flags
 *
 * Options:
 *   --bankroll, -b   Total capital for position sizing (default: 500)
 *   --min-score, -m  Minimum score to display (default: 0)
 *   --watch, -w      Enable watch mode with auto-refresh
 *   --interval, -i   Refresh interval in seconds (default: 300)
 *   --help           Show help
 *   --version        Show version
 *
 * @module cli
 */

// Load environment variables from .env file
import 'dotenv/config';

import React from 'react';
import { render } from 'ink';
import meow from 'meow';
import { App } from './dashboard/index.js';

const cli = meow(
  `
  Usage
    $ npm run dashboard [options]

  Options
    --demo, -d       Run with sample data (no API keys needed)
    --bankroll, -b   Your total capital for position sizing (default: 500)
    --min-score, -m  Minimum score to display (default: 0, range: 0-10)
    --watch, -w      Enable watch mode with auto-refresh
    --interval, -i   Refresh interval in seconds (default: 300)

  Navigation
    Arrow keys       Move up/down in the opportunity list
    Enter            View opportunity details
    b / Escape       Go back to list view
    r                Refresh data
    q / Ctrl+C       Quit

  Score Colors
    Green (7-10)     High confidence opportunity
    Yellow (5-6)     Medium confidence opportunity
    Dim (<5)         Low confidence opportunity

  Examples
    $ npm run dashboard -- --demo
    $ npm run dashboard -- --bankroll 1000 --watch
    $ npm run dashboard -- -b 500 -m 5 -w -i 60
    $ npm run dashboard -- --min-score 7
`,
  {
    importMeta: import.meta,
    flags: {
      bankroll: {
        type: 'number',
        shortFlag: 'b',
        default: 500,
      },
      minScore: {
        type: 'number',
        shortFlag: 'm',
        default: 0,
      },
      watch: {
        type: 'boolean',
        shortFlag: 'w',
        default: false,
      },
      interval: {
        type: 'number',
        shortFlag: 'i',
        default: 300,
      },
      demo: {
        type: 'boolean',
        shortFlag: 'd',
        default: false,
      },
    },
  }
);

// Validate inputs
const bankroll = Math.max(0, cli.flags.bankroll);
const minScore = Math.max(0, Math.min(10, cli.flags.minScore));
const interval = Math.max(10, cli.flags.interval); // Minimum 10 seconds
const watchMode = cli.flags.watch;
const demoMode = cli.flags.demo;

// Render the dashboard
render(
  <App
    bankroll={bankroll}
    minScore={minScore}
    watchMode={watchMode}
    refreshInterval={interval * 1000}
    demo={demoMode}
  />
);
