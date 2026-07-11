# OpenWA - Dockerfile
# Multi-stage build for production-ready image

# ===== Stage 1: Builder =====
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# ===== Stage 2: Production =====
FROM node:22-slim AS production

# Install Chromium + fonts/libs. NOTE: the `chromium` package is kept ONLY to pull
# in the full shared-library closure Chrome needs at runtime; the actual browser
# used by Puppeteer is its own pinned Chrome (installed below), NOT /usr/bin/chromium.
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    dumb-init \
    && rm -rf /var/lib/apt/lists/*

# Use Puppeteer's OWN matched Chrome, NOT the distro chromium.
# The apt `chromium` package (kept above only for its shared-library closure)
# drifts to the newest major (e.g. 149), which breaks CDP against puppeteer-core
# 24.38's expected Chrome 146 → "Promise was collected" / "Target closed" on heavy
# ops (group add, send) and LOGOUT. Letting Puppeteer manage its own pinned Chrome
# keeps the browser and the CDP client version-aligned across rebuilds.
# Fixed cache dir so the build-time download matches runtime resolution (root HOME).
ENV PUPPETEER_CACHE_DIR=/root/.cache/puppeteer

# Create app user for security
RUN groupadd -r openwa && useradd -r -g openwa openwa

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Download the Chrome build matched to the installed Puppeteer (into PUPPETEER_CACHE_DIR).
# Puppeteer's npm install script normally does this, but we run it explicitly so the
# build fails loudly if the matched Chrome can't be fetched.
RUN npx puppeteer browsers install chrome

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create data directories with proper permissions
RUN mkdir -p ./data/sessions ./data/media && \
    chown -R openwa:openwa /app

# Note: Running as root to allow Docker socket access for orchestration
# For production with stricter security, consider using a Docker socket proxy
# USER openwa

# Expose port
EXPOSE 2785

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "require('http').get('http://localhost:2785/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Start with dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]
