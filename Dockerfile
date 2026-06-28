FROM node:20-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx vite build --config web/vite.config.ts

FROM node:20-slim

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist-web ./dist-web
COPY src/ ./src/
COPY server/ ./server/
# Efficiency Lab reads this precomputed study artifact at /api/lab/efficiency.
COPY docs/data/ ./docs/data/

ENV PORT=3001
# Seed a few demo calibration forecasts on first boot (DB is empty in a fresh container).
ENV SEED_DEMO=true
EXPOSE 3001
# tsx is a runtime dependency (see package.json), so it's present after
# `npm ci --omit=dev` — run the TS server directly under Node, no npx fetch.
CMD ["node", "--import", "tsx", "server/src/index.ts"]
