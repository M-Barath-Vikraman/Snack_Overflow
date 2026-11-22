// Runtime environment configuration for Snack Overflow Frontend
// In production or Docker deployment, this file can be replaced or mounted at runtime
// without needing to rebuild frontend assets.
// NEVER put secrets, database credentials or private keys in this file.
window.__APP_CONFIG__ = {
  API_BASE_URL: "/api",
  WS_URL: (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws'
};
