/**
 * PM2 Ecosystem Configuration
 *
 * Manages the prediction market scanner process in production.
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 reload ecosystem.config.js --env production
 *   pm2 stop market-scanner
 *   pm2 logs market-scanner
 *
 * @see https://pm2.keymetrics.io/docs/usage/application-declaration/
 */
module.exports = {
  apps: [{
    name: 'market-scanner',
    script: './dist/index.js',

    // Process management
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',

    // Environment
    env_production: {
      NODE_ENV: 'production'
    },

    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    combine_logs: true,
    merge_logs: true,

    // Graceful shutdown
    kill_timeout: 5000,
    wait_ready: true,
    listen_timeout: 10000
  }]
};
