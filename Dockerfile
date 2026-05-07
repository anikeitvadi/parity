FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy source
COPY . .

# Build frontend
RUN npx vite build --config web/vite.config.ts

# Expose port
ENV PORT=3001
EXPOSE 3001

# Start server (serves API + built frontend)
CMD ["npx", "tsx", "server/src/index.ts"]
