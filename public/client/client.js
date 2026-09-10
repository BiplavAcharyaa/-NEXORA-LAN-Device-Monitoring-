function getOrCreateDeviceId() {
  let id = localStorage.getItem("lan_monitor_device_id");
  if (!id) {
    id = "dev-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("lan_monitor_device_id", id);
  }
  return id;
}

function collectDeviceInfo() {
  return {
    deviceId: getOrCreateDeviceId(),
    screenResolution: screen.width + "x" + screen.height,
    viewport: window.innerWidth + "x" + window.innerHeight,
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || ""
  };
}

async function registerDevice() {
  const info = collectDeviceInfo();
  try {
    await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(info)
    });
  } catch (err) {}
  return info.deviceId;
}

let ws;
let reconnectDelay = 1000;

function connectWebSocket(deviceId) {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(protocol + "//" + location.host + "/ws");

  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(JSON.stringify({ type: "identify_device", deviceId }));
    setConnStatus("Online", true);
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (msg.type === "ping_server") {
      ws.send(JSON.stringify({ type: "pong_client" }));
      ws.send(JSON.stringify({ type: "heartbeat" }));
    }
  };

  ws.onclose = () => {
    setConnStatus("Reconnecting...", false);
    setTimeout(() => connectWebSocket(deviceId), reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 1.5, 15000);
  };

  ws.onerror = () => {
    try {
      ws.close();
    } catch (err) {}
  };
}

function setConnStatus(text, online) {
  const el = document.getElementById("connStatus");
  const dot = document.getElementById("statusDot");
  if (el) el.textContent = text;
  if (dot) dot.style.background = online ? "#22c55e" : "#ef4444";
  if (dot) dot.style.boxShadow = online ? "0 0 12px #22c55e" : "0 0 12px #ef4444";
}

(async function init() {
  const deviceId = await registerDevice();
  document.getElementById("deviceId").textContent = deviceId;
  connectWebSocket(deviceId);

  setInterval(() => {
    registerDevice();
  }, 60000);
})();
