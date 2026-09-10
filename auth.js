const config = require("./config");

function requireAuth(req, res, next) {
  if (req.session && req.session.isAdmin) {
    return next();
  }
  return res.status(401).json({ error: "Unauthorized" });
}

function login(req, res) {
  const { username, password } = req.body || {};
  if (username === config.ADMIN_USERNAME && password === config.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true });
  }
  return res.status(401).json({ error: "Invalid credentials" });
}

function logout(req, res) {
  req.session.destroy(() => {
    res.json({ success: true });
  });
}

function checkSession(req, res) {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
}

module.exports = { requireAuth, login, logout, checkSession };
