#!/bin/sh
set -e

CONFIG_FILE="/usr/share/nginx/html/config.js"

# Generate or update runtime config.js from container environment variables if provided
if [ -n "$API_BASE_URL" ] || [ -n "$WS_URL" ]; then
  cat <<EOF > "$CONFIG_FILE"
window.__APP_CONFIG__ = {
  API_BASE_URL: "${API_BASE_URL:-http://localhost:3000/api}",
  WS_URL: "${WS_URL:-ws://localhost:3000}"
};
EOF
  echo "[entrypoint] Runtime config.js generated with API_BASE_URL=$API_BASE_URL, WS_URL=$WS_URL"
fi
