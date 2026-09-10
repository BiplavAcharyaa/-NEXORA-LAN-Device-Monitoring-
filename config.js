module.exports = {
  PORT: 3000,
  ADMIN_USERNAME: "admin",
  ADMIN_PASSWORD: "admin123",
  SESSION_SECRET: "lan-monitor-secret-key-change-me",
  HEARTBEAT_INTERVAL_MS: 15000,
  OFFLINE_TIMEOUT_MS: 40000,
  DATA_DIR: __dirname + "/data",
  DEVICES_FILE: __dirname + "/data/devices.json",
  SESSIONS_FILE: __dirname + "/data/sessions.json"
};
