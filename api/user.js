/**
 * Vercel Node.js Serverless — /api/user
 *
 * POST { action: "save", email, name, profile, plan, lockedUntil }
 *   → upserts user + profile in MongoDB
 *
 * GET ?email=xxx
 *   → returns user + profile
 */

const { getDb } = require("./db");

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  const raw = typeof req.body === "string" ? req.body : "";
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(204).end();

  try {
    const db = await getDb();
    const users = db.collection("users");

    // ── GET user by email ────────────────────────────────────────────────────
    if (req.method === "GET") {
      const email = (req.query?.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email query param required" });

      const user = await users.findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });

      return res.status(200).json({ ok: true, user });
    }

    // ── POST save/update user ────────────────────────────────────────────────
    if (req.method === "POST") {
      const body = parseBody(req);
      const email = (body.email || "").trim().toLowerCase();
      if (!email) return res.status(400).json({ error: "email is required" });

      const now = new Date();

      const update = {
        $set: {
          email,
          name: body.name || "",
          plan: body.plan || "starter",
          updatedAt: now,
        },
        $setOnInsert: {
          createdAt: now,
        },
      };

      // Save profile if provided
      if (body.profile) {
        update.$set.profile = {
          summary: body.profile.summary || "",
          profession: body.profile.profession || "",
          topics: body.profile.topics || "",
          avoid: body.profile.avoid || "",
          digestTime: body.profile.digestTime || "13:00",
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
