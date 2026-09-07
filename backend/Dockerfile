FROM oven/bun:1-slim AS base

# Install Python + ffmpeg + curl + unzip (for Deno)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install Deno (pinned stable version for yt-dlp JavaScript challenge solver)
RUN curl -fsSL https://deno.land/x/install/install.sh | sh -s v2.2.3
ENV DENO_INSTALL="/root/.deno"
ENV PATH="$DENO_INSTALL/bin:$PATH"

# Install latest yt-dlp + yt-dlp-ejs + gallery-dl
RUN pip3 install --break-system-packages --no-cache-dir -U yt-dlp yt-dlp-ejs gallery-dl \
    && yt-dlp --version \
    && gallery-dl --version

WORKDIR /app

# Copy package files and install deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production 2>/dev/null || bun install --production

# Copy source code
COPY src ./src
COPY tsconfig.json ./
COPY cookies.txt* ./

# Create temp directory for downloads and persistent data directory
RUN mkdir -p /tmp/download-everything /data/cookies && chmod 777 /tmp/download-everything /data /data/cookies

VOLUME ["/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

EXPOSE 3001

# Use production mode
ENV NODE_ENV=production
ENV DATA_DIR=/data

CMD ["bun", "run", "--smol", "src/index.ts"]
