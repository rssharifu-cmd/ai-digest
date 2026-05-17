/**
 * Vercel Node.js Serverless — /api/user
 *
 * All routes require Authorization: Bearer <token>
 *
 * POST { action: "save", profile, plan, lockedUntil }
 *   → upserts profile for authenticated user
 *
 * GET (no params needed — reads from JWT)
 *   → returns authenticated user + profile
 */

const jwt = require("jsonwebtoken");
const { getDb } = require("./db");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req.body === "string" ? req.body : "";
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

function extractEmail(req) {
  const secret = (process.env.JWT_SECRET || "").trim();
  if (!secret) return null;
  const header = req.headers?.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7).trim();
  try {
    const decoded = jwt.verify(token, secret);
    return decoded.email || null;
  } catch {
    return null;
  }
}

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  // Auth check
  const email = extractEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  try {
    const db = await getDb();
    const users = db.collection("users");

    // ── GET user ─────────────────────────────────────────────────────────────
    if (req.method === "GET") {
      const user = await users.findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ ok: true, user: safeUser(user) });
    }

    // ── POST save/update profile ──────────────────────────────────────────────
    if (req.method === "POST") {
      const body = parseBody(req);
      const now = new Date();

      const update = {
        $set: { updatedAt: now },
        $setOnInsert: { createdAt: now },
      };

      // Update name if provided
      if (body.name) update.$set.name = body.name;

      // Update plan if provided
      if (body.plan) update.$set.plan = body.plan;

      // Save profile if provided
      if (body.profile) {
        update.$set.profile = {
          summary: body.profile.summary || "",
          profession: body.profile.profession || "",
          topics: body.profile.topics || "",
          avoid: body.profile.avoid || "",
          digestTime: body.profile.digestTime || "08:00",
          lockedUntil: body.lockedUntil ? new Date(body.lockedUntil) : null,
          savedAt: now,
        };
      }

      await users.updateOne({ email }, update, { upsert: true });

      return res.status(200).json({ ok: true, email });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("user route error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = handler;
