const jwt = require("jsonwebtoken");

function cors(req, res) {
  const origin = req.headers?.origin || "";
  const defaultOrigins = [
    "https://signal.app",
    "https://www.signal.app",
    "https://sharflow.com",
    "https://www.sharflow.com",
  ];
  const allowedOrigins = [...defaultOrigins, ...(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)];

  const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const isVercelPreview = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  const isAllowed = !origin || isLocalhost || isVercelPreview || allowedOrigins.includes(origin);

  res.setHeader("Access-Control-Allow-Origin", isAllowed ? (origin || "*") : "null");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req.body === "string" ? req.body : "";
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function extractEmail(req) {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) return null;

  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ")) return null;

  try {
    const decoded = jwt.verify(header.slice(7).trim(), secret);
    return decoded.email || null;
  } catch {
    return null;
  }
}

function requireEmail(req, res) {
  const email = extractEmail(req);
  if (!email) {
    res.status(401).json({ error: "Unauthorized. Please log in." });
    return null;
  }
  return email;
}

module.exports = {
  cors,
  parseBody,
  extractEmail,
  requireEmail,
};
