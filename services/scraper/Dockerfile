# ---------------------------------------------------------------------------
# Scraper service — multi-stage Docker build
# ---------------------------------------------------------------------------

# === Stage 1: Build ===
FROM node:20-slim AS builder

WORKDIR /app

# Copy root tsconfig for extends
COPY tsconfig.base.json /app/tsconfig.base.json

# Copy package files and install dependencies
COPY services/scraper/package.json services/scraper/package-lock.json* ./services/scraper/
WORKDIR /app/services/scraper
RUN npm install --ignore-scripts

# Copy source and build
COPY services/scraper/tsconfig.json ./
COPY services/scraper/src ./src
RUN npx tsc

# === Stage 2: Production ===
FROM node:20-slim AS runner

# Install Playwright system dependencies and Chromium only
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libnss3 \
      libnspr4 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libdbus-1-3 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxfixes3 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libatspi2.0-0 \
      libwayland-client0 \
      fonts-noto-color-emoji \
      fonts-liberation \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies only
COPY services/scraper/package.json services/scraper/package-lock.json* ./
RUN npm install --omit=dev --ignore-scripts

# Install Playwright Chromium browser
RUN npx playwright install chromium

# Copy compiled output from builder
COPY --from=builder /app/services/scraper/dist ./dist

# Runtime configuration
ENV NODE_ENV=production
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist/server.js"]
