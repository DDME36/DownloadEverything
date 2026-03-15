FROM oven/bun:1 AS base

# ติดตั้ง Python + yt-dlp + ffmpeg (optimized for free tier)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    && pip3 install --break-system-packages yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Copy package files and install deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production 2>/dev/null || bun install --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Create temp directory for downloads with cleanup
RUN mkdir -p /tmp/download-everything && chmod 777 /tmp/download-everything

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001

# Use production mode
ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]

