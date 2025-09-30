# Multi-stage build for Unicity Explorer
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git

WORKDIR /workspace

# Copy package files (including lock files if they exist)
COPY package*.json pnpm-lock.yaml* ./

# Install dependencies (npm install will use lock file if present)
RUN npm install --omit=dev

# Copy application code
COPY . .

# Build CSS files if needed
RUN npm run css || true

# Production stage
FROM node:18-alpine

# Install runtime dependencies
RUN apk add --no-cache \
    git \
    tini

# Create non-root user (use higher GID/UID to avoid conflicts)
RUN addgroup -g 10001 explorer && \
    adduser -u 10001 -G explorer -s /bin/sh -D explorer

WORKDIR /workspace

# Copy from builder
COPY --from=builder --chown=explorer:explorer /workspace/node_modules ./node_modules
COPY --chown=explorer:explorer . .

# Create data directory
RUN mkdir -p /workspace/data && \
    chown -R explorer:explorer /workspace/data

# Switch to non-root user
USER explorer

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=30s \
    CMD node -e "require('http').get('http://localhost:3002/api/status', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Use tini as PID 1
ENTRYPOINT ["/sbin/tini", "--"]

# Default command
CMD ["npm", "start"]

# Expose port
EXPOSE 3002