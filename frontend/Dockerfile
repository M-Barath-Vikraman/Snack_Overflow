# =============================================================
# Snack Overflow — Frontend Dockerfile (Multi-Stage Build)
# =============================================================

# -------------------------------------------------------------
# Stage 1: Build Static React/Vite Bundle
# -------------------------------------------------------------
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies reproducibly
COPY package.json package-lock.json ./
RUN npm ci

# Copy build configs, index.html, static assets and source
COPY tsconfig.json tsconfig.node.json vite.config.ts index.html ./
COPY public ./public/
COPY src ./src/

# Compile TypeScript and bundle production assets into /app/dist
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Production Nginx Server
# -------------------------------------------------------------
FROM nginx:alpine AS runner

# Remove default nginx static assets and configuration
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copy built frontend assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy runtime configuration entrypoint script
COPY docker-entrypoint.sh /docker-entrypoint.d/40-generate-config.sh
RUN sed -i 's/\r$//' /docker-entrypoint.d/40-generate-config.sh && \
    chmod +x /docker-entrypoint.d/40-generate-config.sh

# Prepare directory permissions and PID file for non-root execution
RUN touch /var/run/nginx.pid && \
    chown -R nginx:nginx /var/run/nginx.pid /var/cache/nginx /var/log/nginx /etc/nginx/conf.d /usr/share/nginx/html

# Switch to non-root nginx user
USER nginx

# Expose unprivileged HTTP port (8080)
EXPOSE 8080

# Container healthcheck using IPv4 loopback
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:8080/health || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
