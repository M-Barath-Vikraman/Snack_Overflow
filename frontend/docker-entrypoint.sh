#!/bin/sh
set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"
NGINX_CONF="/etc/nginx/conf.d/default.conf"

# 1. Normalize BACKEND_URL if provided (strip trailing slashes, ensure protocol)
if [ -n "$BACKEND_URL" ]; then
  case "$BACKEND_URL" in
    http://*|https://*)
      TARGET_BACKEND_URL="${BACKEND_URL%/}"
      ;;
    *)
      TARGET_BACKEND_URL="http://${BACKEND_URL%/}"
      ;;
  esac
fi

# 2. Generate or update runtime config.js
# API_BASE_URL defaults to /api so browser requests route to the Nginx reverse proxy.
# WS_URL defaults to the frontend origin with /ws (e.g. ws(s)://<frontend-host>/ws).
# If API_BASE_URL or WS_URL are explicitly passed in environment, those take precedence.
CONFIG_API_URL="${API_BASE_URL:-/api}"

if [ -n "$WS_URL" ]; then
  cat <<EOF > "$CONFIG_FILE"
window.__APP_CONFIG__ = {
  API_BASE_URL: "$CONFIG_API_URL",
  WS_URL: "$WS_URL"
};
EOF
else
  cat <<EOF > "$CONFIG_FILE"
window.__APP_CONFIG__ = {
  API_BASE_URL: "$CONFIG_API_URL",
  WS_URL: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws'
};
EOF
fi
echo "[entrypoint] Runtime config.js generated with API_BASE_URL=$CONFIG_API_URL"

# 4. Generate dynamic Nginx configuration if BACKEND_URL is provided
if [ -n "$TARGET_BACKEND_URL" ]; then
  cat <<EOF > "$NGINX_CONF"
server {
    listen 8080;
    listen [::]:8080;
    server_name localhost;

    root /usr/share/nginx/html;
    index index.html;

    # Health check endpoint for container orchestrators
    location /health {
        access_log off;
        default_type text/plain;
        return 200 "healthy\n";
    }

    # Runtime configuration file: NEVER CACHE
    location = /config.js {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        expires off;
        try_files \$uri =404;
    }

    # HTML entrypoint: NEVER CACHE
    location = /index.html {
        add_header Cache-Control "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0";
        expires off;
        try_files \$uri =404;
    }

    # Static assets (Vite hashed bundles): Long-term immutable caching
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        try_files \$uri =404;
    }

    # Reverse proxy for /api to backend service
    location /api {
        proxy_pass ${TARGET_BACKEND_URL}/api;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Reverse proxy for WebSocket connections to backend service
    location /ws {
        proxy_pass ${TARGET_BACKEND_URL}/ws;
        proxy_http_version 1.1;
        proxy_ssl_server_name on;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$proxy_host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Single Page Application (SPA) routing fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  echo "[entrypoint] Dynamic Nginx configuration generated with BACKEND_URL=$TARGET_BACKEND_URL"
else
  echo "[entrypoint] BACKEND_URL not set; using safe static Nginx configuration"
fi

# 5. Validate Nginx configuration syntax before starting Nginx
echo "[entrypoint] Validating Nginx configuration syntax..."
nginx -t
echo "[entrypoint] Nginx configuration validated successfully."
