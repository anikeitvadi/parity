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

ENV PORT=3001
EXPOSE 3001
CMD ["npx", "tsx", "server/src/index.ts"]
