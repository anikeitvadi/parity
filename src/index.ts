/**
 * Prediction Market Edge Scanner
 * Main entry point with Bree job scheduler and graceful shutdown
 *
 * @module index
 */

import Bree from 'bree';
import Graceful from '@ladjs/graceful';
import path from 'path';
import { fileURLToPath } from 'url';
import { schedulerLogger as logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './database/schema.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initialize and start the job scheduler
 */
async function main(): Promise<void> {
  logger.info('Prediction Market Scanner starting...');

  // Initialize database (creates tables if not exist)
  try {
    initDatabase();
    logger.info('Database initialized');
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database');
    process.exit(1);
  }

  // Initialize Bree scheduler with worker threads
  const bree = new Bree({
    root: path.join(__dirname, 'jobs'),
    jobs: [
      {
        name: 'fetch-polymarket',
        interval: '15m',
        timeout: '5m',
      },
      {
        name: 'fetch-kalshi',
        interval: '15m',
        timeout: '5m',
      },
      {
        name: 'match-markets',
        interval: '30m',
        timeout: '10m',
      },
      {
        name: 'detect-opportunities',
        interval: '30m',
        timeout: '10m',
      },
    ],
    errorHandler: (error, data) => {
      logger.error(
        { error, worker: data.name },
        'Job failed'
      );
    },
    workerMessageHandler: (data) => {
      const { message, name } = data;
      if (typeof message === 'object' && message !== null) {
        const msg = message as Record<string, unknown>;
        if (msg.success) {
          logger.info(
            { message: msg, worker: name },
            'Job completed'
          );
        } else {
          logger.warn(
            { message: msg, worker: name },
            'Job completed with errors'
          );
        }
      } else {
        logger.info(
          { message, worker: name },
          'Job message received'
        );
      }
    },
  });

  // Set up graceful shutdown
  const graceful = new Graceful({
    brees: [bree],
    customHandlers: [
      async () => {
        logger.info('Closing database connection');
        closeDatabase();
      },
    ],
  });
  graceful.listen();

  // Start the scheduler
  try {
    logger.info('Starting job scheduler');
    await bree.start();
    logger.info(
      { jobs: bree.config.jobs.map((j) => (typeof j === 'string' ? j : j.name)) },
      'Jobs scheduled successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Failed to start job scheduler');
    process.exit(1);
  }
}

// Run the main function
main().catch((error) => {
  logger.error({ error }, 'Unhandled error in main');
  process.exit(1);
});
