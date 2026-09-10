let allDevices = [];
let currentDeviceId = null;
let ws;

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");

async function checkAuth() {
  const res = await fetch("/api/auth/check");
  const data = await res.json();
  if (data.isAdmin) {
    showDashboard();
  } else {
    showLogin();
  }
}

function showLogin() {
  loginScreen.classList.remove("hidden");
  dashboard.classList.add("hidden");
}

function showDashboard() {
  loginScreen.classList.add("hidden");
  dashboard.classList.remove("hidden");
  loadDevices();
  connectAdminWs();
}

document.getElementById("loginBtn").addEventListener("click", async () => {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("loginError");
  errorEl.textContent = "";
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showDashboard();
    } else {
      errorEl.textContent = data.error || "Login failed";
    }
  } catch (err) {
    errorEl.textContent = "Connection error";
  }
});

document.getElementById("password").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("loginBtn").click();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  if (ws) ws.close();
  showLogin();
});

async function loadDevices() {
  const res = await fetch("/api/admin/devices");
  if (res.status === 401) return showLogin();
  const data = await res.json();
  allDevices = data.devices;
  renderStats();
  renderTable();
}

function renderStats() {
  const total = allDevices.length;
  const online = allDevices.filter((d) => d.status === "online").length;
  document.getElementById("statTotal").textContent = total;
  document.getElementById("statOnline").textContent = online;
  document.getElementById("statOffline").textContent = total - online;
}

function getFiltered() {
  const q = document.getElementById("searchInput").value.toLowerCase().trim();
  const statusFilter = document.getElementById("filterStatus").value;
  return allDevices.filter((d) => {
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (!q) return true;
    const haystack = [
      d.deviceId, d.customName, d.ip, d.browser, d.os, d.language, d.timezone
    ].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function renderTable() {
  const filtered = getFiltered();
  const tbody = document.getElementById("devicesBody");
  const empty = document.getElementById("emptyState");
  tbody.innerHTML = "";

  if (filtered.length === 0) {
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  filtered
    .sort((a, b) => (b.lastSeen || "").localeCompare(a.lastSeen || ""))
    .forEach((d) => {
      const tr = document.createElement("tr");
      tr.innerHTML =
        '<td><span class="badge ' + d.status + '"><span class="dot"></span>' + capitalize(d.status) + '</span></td>' +
        '<td>' + escapeHtml(d.customName || d.deviceId) + '</td>' +
        '<td>' + escapeHtml(d.ip || "-") + '</td>' +
        '<td>' + escapeHtml(d.browser || "-") + '</td>' +
        '<td>' + escapeHtml(d.os || "-") + '</td>' +
        '<td>' + escapeHtml(d.screenResolution || "-") + '</td>' +
        '<td>' + formatDate(d.firstSeen) + '</td>' +
        '<td>' + formatDate(d.lastSeen) + '</td>' +
        '<td>' + (d.totalSessions || 0) + '</td>' +
        '<td class="row-actions"><button data-id="' + d.deviceId + '">View</button></td>';
      tr.addEventListener("click", () => openDetail(d.deviceId));
      tbody.appendChild(tr);
    });
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}

function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString();
}

function escapeHtml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

document.getElementById("searchInput").addEventListener("input", renderTable);
document.getElementById("filterStatus").addEventListener("change", renderTable);

async function openDetail(deviceId) {
  currentDeviceId = deviceId;
  const device = allDevices.find((d) => d.deviceId === deviceId);
  if (!device) return;

  document.getElementById("modalTitle").textContent = device.customName || deviceId;
  document.getElementById("renameInput").value = device.customName || "";

  const grid = document.getElementById("detailGrid");
  grid.innerHTML = [
    ["Device ID", device.deviceId],
    ["Status", capitalize(device.status)],
    ["IP Address", device.ip],
    ["Browser", device.browser],
    ["OS / Platform", device.os],
    ["Screen Resolution", device.screenResolution],
    ["Viewport", device.viewport],
    ["Language", device.language],
    ["Timezone", device.timezone],
    ["First Seen", formatDate(device.firstSeen)],
    ["Last Seen", formatDate(device.lastSeen)],
    ["Total Sessions", device.totalSessions || 0]
  ].map(
    ([label, value]) =>
      '<div class="detail-item"><span class="label">' + label + '</span><span class="value">' + escapeHtml(value || "-") + '</span></div>'
  ).join("");

  const res = await fetch("/api/admin/devices/" + encodeURIComponent(deviceId) + "/sessions");
  const data = await res.json();
  const sessionsBody = document.getElementById("sessionsBody");
  sessionsBody.innerHTML = "";
  (data.sessions || [])
    .slice()
    .reverse()
    .forEach((s) => {
      let duration = "-";
      if (s.connectedAt && s.disconnectedAt) {
        const mins = (new Date(s.disconnectedAt) - new Date(s.connectedAt)) / 60000;
        duration = mins.toFixed(1) + " min";
      } else if (s.connectedAt && !s.disconnectedAt) {
        duration = "Active";
      }
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td>" + formatDate(s.connectedAt) + "</td>" +
        "<td>" + (s.disconnectedAt ? formatDate(s.disconnectedAt) : "Active") + "</td>" +
        "<td>" + duration + "</td>" +
        "<td>" + escapeHtml(s.ip || "-") + "</td>";
      sessionsBody.appendChild(tr);
    });

  document.getElementById("detailModal").classList.remove("hidden");
}

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("detailModal").classList.add("hidden");
});

document.getElementById("renameBtn").addEventListener("click", async () => {
  if (!currentDeviceId) return;
  const customName = document.getElementById("renameInput").value.trim();
  await fetch("/api/admin/devices/" + encodeURIComponent(currentDeviceId) + "/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ customName })
  });
  await loadDevices();
  openDetail(currentDeviceId);
});

document.getElementById("deleteDeviceBtn").addEventListener("click", async () => {
  if (!currentDeviceId) return;
  if (!confirm("Delete this device and all its history?")) return;
  await fetch("/api/admin/devices/" + encodeURIComponent(currentDeviceId), {
    method: "DELETE"
  });
  document.getElementById("detailModal").classList.add("hidden");
  await loadDevices();
});

document.getElementById("exportBtn").addEventListener("click", () => {
  window.location.href = "/api/admin/export";
});

function connectAdminWs() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  ws = new WebSocket(protocol + "//" + location.host + "/ws");

  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "identify_admin" }));
  };

  ws.onmessage = (event) => {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch (err) {
      return;
    }
    if (msg.type === "device_update") {
      const idx = allDevices.findIndex((d) => d.deviceId === msg.deviceId);
      const merged = Object.assign({ deviceId: msg.deviceId }, msg.device);
      if (idx >= 0) {
        merged.totalSessions = allDevices[idx].totalSessions;
        allDevices[idx] = merged;
      } else {
        allDevices.push(merged);
      }
      renderStats();
      renderTable();
    }
    if (msg.type === "device_removed") {
      allDevices = allDevices.filter((d) => d.deviceId !== msg.deviceId);
      renderStats();
      renderTable();
    }
  };

  ws.onclose = () => {
    setTimeout(() => {
      if (!dashboard.classList.contains("hidden")) connectAdminWs();
    }, 3000);
  };
}

setInterval(() => {
  if (!dashboard.classList.contains("hidden")) loadDevices();
}, 20000);

checkAuth();
