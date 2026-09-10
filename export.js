const ExcelJS = require("exceljs");
const store = require("./store");

async function buildWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LAN Device Monitor";
  workbook.created = new Date();

  const devicesSheet = workbook.addWorksheet("Devices");
  devicesSheet.columns = [
    { header: "Device ID", key: "deviceId", width: 36 },
    { header: "Status", key: "status", width: 10 },
    { header: "IP Address", key: "ip", width: 18 },
    { header: "Browser", key: "browser", width: 16 },
    { header: "OS", key: "os", width: 16 },
    { header: "Screen Resolution", key: "screen", width: 18 },
    { header: "Viewport", key: "viewport", width: 16 },
    { header: "Language", key: "language", width: 12 },
    { header: "Timezone", key: "timezone", width: 22 },
    { header: "First Seen", key: "firstSeen", width: 22 },
    { header: "Last Seen", key: "lastSeen", width: 22 },
    { header: "Total Sessions", key: "totalSessions", width: 14 },
    { header: "Custom Name", key: "customName", width: 20 }
  ];
  devicesSheet.getRow(1).font = { bold: true };
  devicesSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" }
  };
  devicesSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };

  const devices = store.getDevices();
  const sessions = store.getAllSessions();

  Object.keys(devices).forEach((deviceId) => {
    const d = devices[deviceId];
    devicesSheet.addRow({
      deviceId,
      status: d.status || "offline",
      ip: d.ip || "",
      browser: d.browser || "",
      os: d.os || "",
      screen: d.screenResolution || "",
      viewport: d.viewport || "",
      language: d.language || "",
      timezone: d.timezone || "",
      firstSeen: d.firstSeen ? new Date(d.firstSeen).toLocaleString() : "",
      lastSeen: d.lastSeen ? new Date(d.lastSeen).toLocaleString() : "",
      totalSessions: (sessions[deviceId] || []).length,
      customName: d.customName || ""
    });
  });

  const sessionsSheet = workbook.addWorksheet("Sessions");
  sessionsSheet.columns = [
    { header: "Device ID", key: "deviceId", width: 36 },
    { header: "Device Name", key: "deviceName", width: 20 },
    { header: "Connected At", key: "connectedAt", width: 22 },
    { header: "Disconnected At", key: "disconnectedAt", width: 22 },
    { header: "Duration (min)", key: "duration", width: 16 },
    { header: "IP Address", key: "ip", width: 18 }
  ];
  sessionsSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sessionsSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" }
  };

  Object.keys(sessions).forEach((deviceId) => {
    const deviceName = (devices[deviceId] && devices[deviceId].customName) || deviceId;
    sessions[deviceId].forEach((s) => {
      let duration = "";
      if (s.connectedAt && s.disconnectedAt) {
        duration = (
          (new Date(s.disconnectedAt) - new Date(s.connectedAt)) /
          60000
        ).toFixed(2);
      }
      sessionsSheet.addRow({
        deviceId,
        deviceName,
        connectedAt: s.connectedAt ? new Date(s.connectedAt).toLocaleString() : "",
        disconnectedAt: s.disconnectedAt ? new Date(s.disconnectedAt).toLocaleString() : "Active",
        duration,
        ip: s.ip || ""
      });
    });
  });

  return workbook;
}

module.exports = { buildWorkbook };
