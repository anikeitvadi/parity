import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: isDevelopment ? 'debug' : 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  // Error serialization for full stack traces
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  // Redact sensitive data
  redact: ['apiKey', 'privateKey', 'password', 'secret', 'POLYMARKET_PRIVATE_KEY'],
  base: {
    service: 'prediction-market-scanner',
    environment: process.env.NODE_ENV || 'development',
  },
});

// Create child loggers for specific services
export const polymarketLogger = logger.child({ component: 'polymarket' });
export const kalshiLogger = logger.child({ component: 'kalshi' });
export const databaseLogger = logger.child({ component: 'database' });
export const schedulerLogger = logger.child({ component: 'scheduler' });
export const matcherLogger = logger.child({ component: 'matcher' });
export const detectorLogger = logger.child({ component: 'detector' });
