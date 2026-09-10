const express = require("express");
const http = require("http");
const os = require("os");
const path = require("path");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const { WebSocketServer } = require("ws");

const config = require("./config");
const store = require("./store");
const auth = require("./auth");
const { parseUserAgent } = require("./uaparse");
const { buildWorkbook } = require("./export");

store.loadAll();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 }
  })
);

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  let ip = forwarded ? forwarded.split(",")[0].trim() : req.socket.remoteAddress;
  if (ip && ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") ip = "127.0.0.1";
  return ip;
}

app.post("/api/auth/login", auth.login);
app.post("/api/auth/logout", auth.logout);
app.get("/api/auth/check", auth.checkSession);

app.post("/api/register", (req, res) => {
  const { deviceId, screenResolution, viewport, language, timezone, customName } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: "deviceId required" });

  const ua = req.headers["user-agent"] || "";
  const parsed = parseUserAgent(ua);
  const ip = getClientIp(req);
  const now = new Date().toISOString();

  const existing = store.getDevice(deviceId);
  const fields = {
    ip,
    browser: parsed.browser,
    os: parsed.os,
    userAgent: ua,
    screenResolution: screenResolution || (existing && existing.screenResolution) || "",
    viewport: viewport || (existing && existing.viewport) || "",
    language: language || (existing && existing.language) || "",
    timezone: timezone || (existing && existing.timezone) || "",
    lastSeen: now,
    status: "online"
  };
  if (!existing) {
    fields.firstSeen = now;
    fields.customName = customName || "";
  }

  const device = store.upsertDevice(deviceId, fields);
  res.json({ success: true, device });
});

app.use("/api/admin", auth.requireAuth);

app.get("/api/admin/devices", (req, res) => {
  const devices = store.getDevices();
  const sessions = store.getAllSessions();
  const result = Object.keys(devices).map((id) => {
    const d = devices[id];
    return Object.assign({ deviceId: id }, d, {
      totalSessions: (sessions[id] || []).length
    });
  });
  res.json({ devices: result });
});

app.get("/api/admin/devices/:id/sessions", (req, res) => {
  const sessions = store.getSessions(req.params.id);
  res.json({ sessions });
});

app.post("/api/admin/devices/:id/rename", (req, res) => {
  const { customName } = req.body || {};
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });
  store.upsertDevice(req.params.id, { customName: customName || "" });
  res.json({ success: true });
});

app.delete("/api/admin/devices/:id", (req, res) => {
  const device = store.getDevice(req.params.id);
  if (!device) return res.status(404).json({ error: "Device not found" });
  store.deleteDevice(req.params.id);
  broadcast({ type: "device_removed", deviceId: req.params.id });
  res.json({ success: true });
});

app.get("/api/admin/export", async (req, res) => {
  try {
    const workbook = await buildWorkbook();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=lan-device-monitor-export.xlsx"
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: "Export failed" });
  }
});

app.get("/api/admin/stats", (req, res) => {
  const devices = store.getDevices();
  const list = Object.values(devices);
  const online = list.filter((d) => d.status === "online").length;
  res.json({
    total: list.length,
    online,
    offline: list.length - online
  });
});

app.use("/admin", express.static(path.join(__dirname, "public", "admin")));
app.use(express.static(path.join(__dirname, "public", "client")));

app.get("/admin*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "client", "index.html"));
});

const wss = new WebSocketServer({ server, path: "/ws" });
const clientSockets = new Map();
const adminSockets = new Set();
const offlineTimers = new Map();

function broadcast(payload) {
  const data = JSON.stringify(payload);
  adminSockets.forEach((ws) => {
    if (ws.readyState === ws.OPEN) ws.send(data);
  });
}

function broadcastDeviceUpdate(deviceId) {
  const device = store.getDevice(deviceId);
  if (!device) return;
  broadcast({ type: "device_update", deviceId, device });
}

function scheduleOffline(deviceId) {
  clearOfflineTimer(deviceId);
  const timer = setTimeout(() => {
    const device = store.getDevice(deviceId);
    if (device && device.status === "online" && !clientSockets.has(deviceId)) {
      store.upsertDevice(deviceId, { status: "offline", lastSeen: new Date().toISOString() });
      store.updateLastSession(deviceId, { disconnectedAt: new Date().toISOString() });
      broadcastDeviceUpdate(deviceId);
    }
  }, config.OFFLINE_TIMEOUT_MS);
  offlineTimers.set(deviceId, timer);
}

function clearOfflineTimer(deviceId) {
  const existing = offlineTimers.get(deviceId);
  if (existing) {
    clearTimeout(existing);
    offlineTimers.delete(deviceId);
  }
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.role = null;
  ws.deviceId = null;

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (err) {
      return;
    }

    if (msg.type === "pong_client") {
      ws.isAlive = true;
      return;
    }

    if (msg.type === "identify_admin") {
      ws.role = "admin";
      adminSockets.add(ws);
      return;
    }

    if (msg.type === "identify_device") {
      const deviceId = msg.deviceId;
      if (!deviceId) return;
      ws.role = "device";
      ws.deviceId = deviceId;
      clientSockets.set(deviceId, ws);
      clearOfflineTimer(deviceId);

      const ip = getClientIp(req);
      const now = new Date().toISOString();
      const existing = store.getDevice(deviceId);

      store.upsertDevice(deviceId, {
        status: "online",
        lastSeen: now,
        ip
      });

      store.addSession(deviceId, { connectedAt: now, disconnectedAt: null, ip });
      broadcastDeviceUpdate(deviceId);
      return;
    }

    if (msg.type === "heartbeat" && ws.role === "device" && ws.deviceId) {
      ws.isAlive = true;
      const now = new Date().toISOString();
      store.upsertDevice(ws.deviceId, { status: "online", lastSeen: now });
      clearOfflineTimer(ws.deviceId);
      return;
    }
  });

  ws.on("close", () => {
    if (ws.role === "admin") {
      adminSockets.delete(ws);
      return;
    }
    if (ws.role === "device" && ws.deviceId) {
      if (clientSockets.get(ws.deviceId) === ws) {
        clientSockets.delete(ws.deviceId);
      }
      scheduleOffline(ws.deviceId);
    }
  });

  ws.on("error", () => {
    try {
      ws.terminate();
    } catch (err) {}
  });
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.role === "device") {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      try {
        ws.send(JSON.stringify({ type: "ping_server" }));
      } catch (err) {}
    }
  });
}, config.HEARTBEAT_INTERVAL_MS);

wss.on("close", () => clearInterval(pingInterval));

function getLanIps() {
  const nets = os.networkInterfaces();
  const results = [];
  Object.keys(nets).forEach((name) => {
    nets[name].forEach((net) => {
      if (net.family === "IPv4" && !net.internal) {
        results.push(net.address);
      }
    });
  });
  return results;
}

server.listen(config.PORT, "0.0.0.0", () => {
  const ips = getLanIps();
  console.log("LAN Device Monitor running");
  console.log("Local:   http://localhost:" + config.PORT);
  ips.forEach((ip) => console.log("Network: http://" + ip + ":" + config.PORT));
  console.log("Admin panel: /admin");
});
