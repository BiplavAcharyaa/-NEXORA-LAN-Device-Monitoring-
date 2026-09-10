# LAN Device Monitoring Dashboard

## Setup on the MAIN PC

1. Install Node.js 24.
2. Open a terminal in this folder.
3. Run:
   npm install
   npm start
4. The terminal will print the LAN URL, e.g. http://192.168.1.10:3000

## Usage

- Other devices on the same Wi-Fi/LAN open http://<MAIN-PC-IP>:3000 in any browser. No installation needed.
- Admin dashboard: http://<MAIN-PC-IP>:3000/admin
- Default admin login: admin / admin123 (change in config.js)

## Data

- Stored in data/devices.json and data/sessions.json on the MAIN PC.
- Survives server restarts.

## Export

- Use the "Export .xlsx" button in the admin dashboard to download device and session data.
