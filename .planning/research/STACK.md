# Technology Stack

**Project:** Prediction Market Edge Scanner
**Researched:** 2026-01-29
**Overall Confidence:** MEDIUM-HIGH

## Recommended Stack

### Runtime & Language
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Node.js | 20 LTS+ | Runtime environment | Native .env support, WebSocket performance, large ecosystem for financial bots | HIGH |
| TypeScript | 5.5+ | Type-safe development | Critical for API integrations, prevents runtime errors in production bot, Zod integration | HIGH |

**Rationale:** Node.js 20+ provides native environment variable loading, excellent async/WebSocket performance for real-time market data, and broad library support. TypeScript is essential for managing multiple API schemas (Polymarket, Kalshi, Metaculus) with type safety.

### Core Framework
| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| No framework | N/A | Lightweight bot | Frameworks like Express add unnecessary overhead for a background bot. Use plain Node.js with scheduled tasks. | HIGH |

**Rationale:** This is a continuously running bot, not a web server. Adding Express/Fastify/Koa provides no benefit and increases memory footprint. Use cron scheduler + direct API calls instead.

### API Clients

#### Polymarket Integration
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| @polymarket/clob-client | latest | Official TypeScript CLOB API client | Official package (updated Jan 13, 2026), supports order book, market data, WebSocket streams | HIGH |
| py-clob-client | latest | Alternative Python client | If choosing Python stack - official, 712 GitHub stars, actively maintained | HIGH |

**Installation:** `npm install @polymarket/clob-client ethers`

**Note:** Polymarket also provides `real-time-data-client` for WebSocket market data streaming.

#### Kalshi Integration
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| Custom REST client | N/A | Kalshi API integration | No official npm package found. Use fetch/axios with Kalshi's OpenAPI spec. API at docs.kalshi.com | MEDIUM |

**Implementation:** Direct REST calls using native fetch or axios. Kalshi requires token refresh every 30 minutes - build re-auth logic.

#### Metaculus Integration
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| Custom REST client | N/A | Metaculus API 2.0 | No official npm package. REST API at metaculus.com/api with OpenAPI 2.0.0 spec | MEDIUM |

**Implementation:** Direct REST calls. API provides question data and community predictions in JSON format.

**Note:** Superforecaster-specific data availability needs verification - API docs don't explicitly mention this endpoint.

### LLM Integration
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| @anthropic-ai/sdk | 0.71.2+ | Claude API integration | Official TypeScript SDK, supports streaming, tools, prompt caching. Updated Dec 2025. | HIGH |

**Installation:** `npm install @anthropic-ai/sdk`

**Features:** Streaming responses, automatic retries on 429/5xx, error handling, Zod schema support for structured outputs.

**Cost optimization:** Use prompt caching for repeated context (market rules, edge detection criteria).

### Messaging
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| twilio | 5.11.2+ | WhatsApp Business API | Official npm package, well-documented Node.js integration, WhatsApp sandbox for testing | HIGH |

**Installation:** `npm install twilio`

**Alternative:** Consider Telegram Bot API (free, no Twilio account needed) if WhatsApp isn't required.

### News & Data Feeds
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| rss-parser | 3.x | RSS feed parsing | 104K size, TypeScript support, handles malformed feeds, 11M+ weekly downloads | HIGH |
| newsdata.io API | N/A | Real-time breaking news | 87K+ sources, 89 languages, real-time updates, 200 free credits/day | MEDIUM |
| newscatcherapi | N/A | Alternative news API | Developer-friendly, rapid updates, good for breaking news correlation | MEDIUM |

**Installation:** `npm install rss-parser`

**Note:** NewsData.io and NewsCatcherAPI are commercial services. Start with RSS feeds from major news sources (Reuters, AP, Bloomberg) using rss-parser.

### HTTP & WebSocket
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| fetch (native) | Built-in | HTTP requests | Native in Node.js 18+, zero dependencies, sufficient for most API calls | HIGH |
| axios | 1.x | Alternative HTTP | Only if you need interceptors, auto-retry, or request cancellation | MEDIUM |
| ws | 8.x | WebSocket client | Lightweight (no Socket.IO overhead), high performance, used for Polymarket/Kalshi real-time feeds | HIGH |

**Installation:** `npm install ws @types/ws`

**Rationale:** Native fetch is sufficient for REST APIs. Use `ws` library for WebSocket connections to order books and market feeds.

### Database
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| better-sqlite3 | 12.6.2+ | Local data storage | Fastest SQLite library for Node.js, synchronous API, zero setup, perfect for single-server bot | HIGH |

**Installation:** `npm install better-sqlite3`

**What to store:**
- Market snapshots for historical comparison
- Detected opportunities (edge size, timestamp, outcome)
- Alert history (prevent duplicate WhatsApp messages)
- Rate limiting state

**Why not PostgreSQL:** Overkill for single-server bot. SQLite is embedded, requires no separate database server, and handles moderate write loads easily.

### Scheduling & Process Management
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| Bree | 9.x | Job scheduling | Modern scheduler with worker threads, cron syntax, async/await, graceful shutdown, retries | HIGH |
| PM2 | 5.x | Process management | Industry standard for Node.js production, auto-restart, log management, clustering | HIGH |

**Installation:**
```bash
npm install bree
npm install -g pm2  # Global installation
```

**Why Bree over node-cron:** Worker threads for CPU-intensive operations (edge analysis), better error handling, job cancellation, human-readable scheduling.

**Why PM2:** Zero-downtime restarts, automatic crash recovery, log rotation, monitoring. Run bot as `pm2 start bot.js --name edge-scanner`.

### Validation & Configuration
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| zod | 4.3.5+ | Runtime validation | TypeScript-first schema validation, validates API responses, config, environment variables | HIGH |
| dotenv | 16.x | Environment variables | Industry standard for .env file loading, 48M+ weekly downloads | HIGH |

**Installation:** `npm install zod dotenv`

**Use case:** Define Zod schemas for API responses from Polymarket/Kalshi to catch schema changes early and prevent runtime errors.

### Logging
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| pino | 9.x | Structured logging | 5x faster than Winston, JSON output, low overhead, perfect for high-frequency bot | HIGH |

**Installation:** `npm install pino pino-pretty`

**Rationale:** Prediction market bots scan frequently. Pino's async logging and minimal CPU overhead prevent logging from becoming a bottleneck. JSON output integrates easily with log aggregators if you scale.

**Alternative:** Winston if you prefer multi-transport support (file + console + remote), but at performance cost.

### Utilities
| Library | Version | Purpose | Why | Confidence |
|---------|---------|---------|-----|------------|
| ethers | 6.x | Ethereum utilities | Required by @polymarket/clob-client for wallet signing | HIGH |
| date-fns | 3.x | Date manipulation | Lightweight, tree-shakeable, better than moment.js for market timestamp handling | HIGH |

**Installation:** `npm install ethers date-fns`

## Alternatives Considered

| Category | Recommended | Alternative | Why Not | Confidence |
|----------|-------------|-------------|---------|------------|
| Language | TypeScript/Node.js | Python + py-clob-client | Node.js better for WebSocket concurrency, though Python has better data science libraries. Choice depends on team expertise. | MEDIUM |
| Database | SQLite (better-sqlite3) | PostgreSQL | Unnecessary complexity for single-server bot with moderate data volume | HIGH |
| HTTP Client | Native fetch | axios | Fetch is sufficient; axios adds 11.7kB and features we don't need | HIGH |
| WebSocket | ws | socket.io | socket.io adds auto-reconnect but also overhead. For market data, raw WebSocket with manual reconnect is faster. | HIGH |
| Scheduler | Bree | node-cron | Bree supports worker threads, retries, graceful shutdown - critical for production bot | HIGH |
| Logger | Pino | Winston | Winston is more popular but slower. Pino's performance matters for high-frequency scanning. | HIGH |
| Process Manager | PM2 | systemd directly | PM2 provides better DX (logs, monitoring, restart policies) vs raw systemd | MEDIUM |
| Messaging | Twilio WhatsApp | Telegram Bot API | Twilio requires paid account; Telegram is free but different UX. User preference. | MEDIUM |

## Language Choice: TypeScript vs Python

**TypeScript Advantages:**
- Better WebSocket concurrency (non-blocking I/O)
- Native async/await for multiple simultaneous API calls
- Polymarket has official TypeScript client
- Lower latency for high-frequency scanning

**Python Advantages:**
- Official py-clob-client (more mature than TS client)
- Better data science libraries (pandas, numpy) if adding ML-based edge detection
- Easier probability calculations

**Recommendation:** **TypeScript** for this use case because:
1. You need concurrent WebSocket connections to multiple markets
2. Real-time scanning benefits from Node.js event loop
3. Polymarket's TS client is official and actively maintained

Use Python only if you plan to add ML/statistical analysis for edge detection.

## Development Dependencies

```bash
npm install -D @types/node @types/better-sqlite3 @types/ws typescript tsx
```

| Package | Purpose |
|---------|---------|
| typescript | TypeScript compiler |
| tsx | Fast TypeScript execution (alternative to ts-node) |
| @types/node | Node.js type definitions |
| @types/better-sqlite3 | SQLite type definitions |
| @types/ws | WebSocket type definitions |

## Infrastructure & Deployment

### Hosting
| Provider | Monthly Cost | Purpose | Why | Confidence |
|----------|--------------|---------|-----|------------|
| Hetzner VPS | $10-15 | 2 vCPU / 8GB RAM | Best price/performance, EU data centers, sufficient for bot workload | MEDIUM-HIGH |
| DigitalOcean Droplet | $18-24 | 2 vCPU / 4GB RAM alternative | More polished DX, global data centers, good docs | MEDIUM-HIGH |

**Recommendation:** Start with **Hetzner CX instance** ($10-15/month, 2 vCPU / 8GB RAM) for best value. Upgrade to DigitalOcean if you need US-based servers for lower latency to Polymarket/Kalshi APIs.

**Important:** Both Polymarket and Kalshi are US-based. Consider VPS location for API latency (US East coast ideal).

### CI/CD
| Technology | Purpose | Why | Confidence |
|------------|---------|-----|------------|
| GitHub Actions | Automated deployment | Free for public repos, SSH deployment to VPS, Docker support | HIGH |
| Docker | Containerization | Reproducible deployments, easier rollback, environment isolation | MEDIUM |

**Workflow:**
1. Push to `main` branch triggers GitHub Actions
2. Build Docker image with dependencies
3. Push to GitHub Container Registry (GHCR)
4. SSH to VPS and pull latest image
5. Restart PM2 process

**Alternative:** Skip Docker for simpler deployments - just `git pull && npm install && pm2 restart`.

### Monitoring
| Tool | Purpose | Why | Confidence |
|------|---------|-----|------------|
| PM2 built-in | Process monitoring | Free, shows CPU/memory, restart on crash | HIGH |
| UptimeRobot | External uptime monitoring | Free tier, email alerts if bot goes down | MEDIUM |
| Pino logs | Application logging | Structured JSON logs for debugging edge detection logic | HIGH |

## Installation Guide

### Full Stack Setup

```bash
# Initialize project
npm init -y
npm install typescript @types/node tsx -D

# Core dependencies
npm install @polymarket/clob-client ethers
npm install @anthropic-ai/sdk
npm install twilio
npm install better-sqlite3
npm install ws @types/ws
npm install rss-parser
npm install bree
npm install pino pino-pretty
npm install zod
npm install dotenv
npm install date-fns

# Production deployment
npm install -g pm2
```

### Environment Variables (.env)

```env
# Polymarket
POLYMARKET_PRIVATE_KEY=0x...
POLYMARKET_API_KEY=...

# Kalshi
KALSHI_EMAIL=...
KALSHI_PASSWORD=...

# Metaculus
METACULUS_API_TOKEN=...

# Claude
ANTHROPIC_API_KEY=sk-ant-...

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+1...

# News APIs (optional)
NEWSDATA_API_KEY=...
NEWSCATCHER_API_KEY=...

# Bot Configuration
SCAN_INTERVAL_MINUTES=5
MIN_EDGE_RATING=8
FEE_THRESHOLD_PERCENT=5
```

## Confidence Assessment

| Component | Confidence | Reason |
|-----------|------------|--------|
| Node.js + TypeScript | HIGH | Industry standard for real-time bots, official Polymarket support |
| Polymarket client | HIGH | Official package, actively maintained (updated Jan 2026) |
| Kalshi/Metaculus clients | MEDIUM | No official npm packages - requires custom implementation |
| Claude SDK | HIGH | Official Anthropic SDK, well-documented |
| Twilio | HIGH | Official package, production-ready WhatsApp integration |
| SQLite | HIGH | Perfect fit for single-server bot, proven reliability |
| News APIs | MEDIUM | Multiple options (newsdata.io, newscatcher) - need to test which has best coverage/latency |
| Hosting | MEDIUM | Hetzner/DO are solid choices but latency to US APIs needs testing |

## Open Questions

1. **Metaculus Superforecaster Data:** API docs don't explicitly mention superforecaster-specific endpoints. May need to:
   - Contact Metaculus for API access
   - Use community median as proxy
   - Find alternative superforecaster data source

2. **API Rate Limits:** Need to verify:
   - Polymarket CLOB rate limits
   - Kalshi API quotas
   - Metaculus rate limits
   - Design backoff/retry strategies accordingly

3. **News Feed Selection:** Which RSS feeds provide fastest breaking news?
   - Reuters vs AP vs Bloomberg latency comparison
   - Consider paid news APIs for millisecond-level updates

4. **WebSocket Reconnection:** Need robust reconnection logic for:
   - Polymarket real-time market data
   - Kalshi WebSocket feeds
   - Handle disconnections without missing opportunities

## Sources

### Official Documentation
- [Polymarket Documentation](https://docs.polymarket.com/)
- [Polymarket CLOB Client (npm)](https://www.npmjs.com/package/@polymarket/clob-client)
- [Polymarket CLOB Client (GitHub)](https://github.com/Polymarket/clob-client)
- [py-clob-client (PyPI)](https://pypi.org/project/py-clob-client/)
- [Kalshi API Documentation](https://docs.kalshi.com/welcome)
- [Metaculus API](https://www.metaculus.com/api/)
- [Anthropic SDK (npm)](https://www.npmjs.com/package/@anthropic-ai/sdk)
- [Anthropic SDK (GitHub)](https://github.com/anthropics/anthropic-sdk-typescript)
- [Twilio WhatsApp API](https://www.twilio.com/docs/whatsapp/quickstart)
- [Twilio npm package](https://www.npmjs.com/package/twilio)

### Library Documentation
- [better-sqlite3 (npm)](https://www.npmjs.com/package/better-sqlite3)
- [better-sqlite3 (GitHub)](https://github.com/WiseLibs/better-sqlite3)
- [ws WebSocket library (npm)](https://www.npmjs.com/package/ws)
- [rss-parser (npm)](https://www.npmjs.com/package/rss-parser)
- [Bree scheduler (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/best-nodejs-schedulers/)
- [Pino logger (npm)](https://www.npmjs.com/package/pino)
- [Zod validation (npm)](https://www.npmjs.com/package/zod)
- [Zod official docs](https://zod.dev/)

### News APIs
- [NewsData.io](https://newsdata.io/)
- [NewsCatcherAPI comparison (NewsData.io blog)](https://newsdata.io/blog/news-api-comparison/)
- [Best News APIs 2026 (DEV Community)](https://dev.to/timhkelly/10-best-news-apis-in-2026-58e3)

### Infrastructure & Deployment
- [Hetzner vs DigitalOcean (DigitalOcean)](https://www.digitalocean.com/resources/articles/digitalocean-vs-hetzner)
- [Low-Cost VPS Providers 2026 (Nucamp)](https://www.nucamp.co/blog/top-10-low-cost-vps-providers-in-2026-affordable-alternatives-to-aws-azure-gcp-and-vercel)
- [GitHub Actions VPS Deployment (DEV Community)](https://dev.to/ikurotime/deploy-docker-containers-in-vps-with-github-actions-2e28)
- [PM2 Process Manager](https://pm2.keymetrics.io/)

### Technical Comparisons
- [Axios vs Fetch 2026 (iProyal)](https://iproyal.com/blog/axios-vs-fetch/)
- [Winston vs Pino (Better Stack)](https://betterstack.com/community/comparisons/pino-vs-winston/)
- [ws vs Socket.IO (DEV Community)](https://dev.to/alex_aslam/nodejs-websockets-when-to-use-ws-vs-socketio-and-why-we-switched-di9)
- [SQLite vs PostgreSQL (SelectHub)](https://www.selecthub.com/relational-database-solutions/postgresql-vs-sqlite/)
- [Prediction Market Bot Architecture (QuantVPS)](https://www.quantvps.com/blog/news-driven-polymarket-bots)

### Blog Posts & Community
- [The Polymarket API (Medium, Jan 2026)](https://medium.com/@gwrx2005/the-polymarket-api-architecture-endpoints-and-use-cases-f1d88fa6c1bf)
- [Market Making on Prediction Markets 2026 (NYC Servers)](https://newyorkcityservers.com/blog/prediction-market-making-guide)
- [Node.js Environment Variables Best Practices (OneUpTime, Jan 2026)](https://oneuptime.com/blog/post/2026-01-06-nodejs-production-environment-variables/view)
