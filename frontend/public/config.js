// Runtime environment configuration for Snack Overflow Frontend
// In production or Docker deployment, this file can be replaced or mounted at runtime
// without needing to rebuild frontend assets.
// NEVER put secrets, database credentials or private keys in this file.
window.__APP_CONFIG__ = {
  API_BASE_URL: "http://localhost:3000/api",
  WS_URL: "ws://localhost:3000"
};
