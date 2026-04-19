# CLAUDE.md

Behavioral guidelines for working on this project, merged with Karpathy's principles.

## Project Overview

Prediction market research tool. Web app (React/Hono) + CLI scanner (Ink). Aggregates Polymarket + Kalshi, provides AI research briefs, calibration tracking, and watchlist curation.

## How to Verify Changes

```bash
npm run check    # Typecheck all 3 tsconfigs + Vite build + 405 tests
npm run dev:web  # Start web app at localhost:5173
```

## Architecture

```
server/         Hono API (port 3001) — routes, cache, prompts
web/            Vite + React SPA — pages, components, hooks
src/            Core engine (shared) — services, detectors, scoring, database
```

- `server/` imports from `src/` directly
- `web/` is standalone, talks to server via `/api`
- Three separate tsconfigs: root, server/, web/
- SQLite with WAL mode for persistence
- SSE streaming for AI briefs

## Key Commands

- `npm run dev:web` — start both servers
- `npm run typecheck` — check all 3 tsconfigs
- `npm run check` — typecheck + build + test
- `npm run test:run` — 405 tests (core engine)
- `npm run build:web` — Vite production build

## Coding Guidelines

### 1. Think Before Coding

- State assumptions explicitly. If uncertain, ask.
- If multiple approaches exist, present them — don't pick silently.
- If something is unclear, stop and ask.

### 2. Simplicity First

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" that wasn't requested.
- If you write 200 lines and it could be 50, rewrite it.

### 3. Surgical Changes

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style. The project uses:
  - ESM imports with `.js` extensions in `src/`
  - Functional React components
  - Tailwind CSS classes (no CSS modules)
  - Pino for server logging
  - Zod for validation
- Remove imports/variables that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

### 4. Goal-Driven Execution

- Transform tasks into verifiable goals.
- Run `npm run typecheck` after any TypeScript change.
- Run `npm run test:run` after changing `src/` code.
- Run `npm run build:web` after changing `web/` code.

## Project-Specific Rules

- **Don't modify `.env`** — it contains real API keys and is gitignored.
- **Don't commit `node_modules/`, `dist/`, `dist-web/`, `markets.db`, `.claude/`** — all gitignored.
- **ESM only** — no `require()`, no CommonJS. Use `import` with `.js` extensions.
- **Strict TypeScript** — no `any` unless absolutely necessary, prefer `unknown` + narrowing.
- **Test environment** — logger is silent when `NODE_ENV=test` or `VITEST` is set.
- **Dual AI provider** — server prefers `XAI_API_KEY` (Grok), falls back to `OPENAI_API_KEY` (GPT-4o). Check `server/src/routes/research.ts`.
- **Market data is public** — both Polymarket Gamma API and Kalshi Events API work without auth.
- **SQLite tables**: `market_snapshots`, `matched_markets`, `opportunities`, `settlement_comparisons`, `user_forecasts`, `market_embedding_meta`.
