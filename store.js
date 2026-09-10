const fs = require("fs");
const path = require("path");
const config = require("./config");

function ensureDataFiles() {
  if (!fs.existsSync(config.DATA_DIR)) {
    fs.mkdirSync(config.DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(config.DEVICES_FILE)) {
    fs.writeFileSync(config.DEVICES_FILE, JSON.stringify({}, null, 2));
  }
  if (!fs.existsSync(config.SESSIONS_FILE)) {
    fs.writeFileSync(config.SESSIONS_FILE, JSON.stringify({}, null, 2));
  }
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "{}");
  } catch (err) {
    return {};
  }
}

function atomicWrite(filePath, data) {
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2));
  fs.renameSync(tmpPath, filePath);
}

let devices = {};
let sessions = {};
let writeQueued = false;

function loadAll() {
  ensureDataFiles();
  devices = readJson(config.DEVICES_FILE);
  sessions = readJson(config.SESSIONS_FILE);
}

function persist() {
  if (writeQueued) return;
  writeQueued = true;
  setTimeout(() => {
    atomicWrite(config.DEVICES_FILE, devices);
    atomicWrite(config.SESSIONS_FILE, sessions);
    writeQueued = false;
  }, 300);
}

function getDevices() {
  return devices;
}

function getDevice(deviceId) {
  return devices[deviceId];
}

function upsertDevice(deviceId, fields) {
  const existing = devices[deviceId] || {};
  devices[deviceId] = Object.assign({}, existing, fields);
  persist();
  return devices[deviceId];
}

function deleteDevice(deviceId) {
  delete devices[deviceId];
  delete sessions[deviceId];
  persist();
}

function getSessions(deviceId) {
  return sessions[deviceId] || [];
}

function addSession(deviceId, sessionEntry) {
  if (!sessions[deviceId]) sessions[deviceId] = [];
  sessions[deviceId].push(sessionEntry);
  if (sessions[deviceId].length > 500) {
    sessions[deviceId] = sessions[deviceId].slice(-500);
  }
  persist();
}

function updateLastSession(deviceId, fields) {
  const arr = sessions[deviceId];
  if (!arr || arr.length === 0) return;
  const last = arr[arr.length - 1];
  Object.assign(last, fields);
  persist();
}

function getAllSessions() {
  return sessions;
}

module.exports = {
  loadAll,
  getDevices,
  getDevice,
  upsertDevice,
  deleteDevice,
  getSessions,
  addSession,
  updateLastSession,
  getAllSessions
};
