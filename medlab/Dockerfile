# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app

# Non-root user for security
RUN addgroup -S medlab && adduser -S medlab -G medlab

# Copy dependencies and source
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Data directory (SQLite database lives here)
RUN mkdir -p /data && chown medlab:medlab /data

USER medlab

ENV NODE_ENV=production \
    PORT=3000 \
    DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
