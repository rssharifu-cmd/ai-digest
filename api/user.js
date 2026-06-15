/**
 * Vercel Node.js Serverless — /api/user
 *
 * All routes require Authorization: Bearer <token>
 *
 * POST { profile, plan, lockedUntil } — save profile + memory
 * POST { action: "feedback", topic, sentiment, storyTitle } — update memory
 *
 * GET — returns authenticated user + profile + memory
 */

const { getDb } = require("./db");
const { cors, parseBody, extractEmail } = require("./http");
const {
  buildMemoryFromOnboarding,
  applyFeedback,
  ensureMemory,
} = require("./memory");

function safeUser(user) {
  const { passwordHash, ...rest } = user;
  return rest;
}

async function handler(req, res) {
  cors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();

  const email = extractEmail(req);
  if (!email) {
    return res.status(401).json({ error: "Unauthorized. Please log in." });
  }

  try {
    const db = await getDb();
    const users = db.collection("users");

    if (req.method === "GET") {
      const user = await users.findOne({ email });
      if (!user) return res.status(404).json({ error: "User not found" });
      return res.status(200).json({ ok: true, user: safeUser(user) });
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const now = new Date();
      const action = (body.action || "save").trim();

      const user = await users.findOne({ email });

      // ── FEEDBACK — update memory from dashboard 👍/👎 ─────────────────────
      if (action === "feedback") {
        if (!user) return res.status(404).json({ error: "User not found" });

        const sentiment = (body.sentiment || "").trim();
        if (!["like", "dislike"].includes(sentiment)) {
          return res.status(400).json({ error: "sentiment must be 'like' or 'dislike'" });
        }

        const currentMemory = ensureMemory(user, user.profile);
        const updatedMemory = applyFeedback(currentMemory, {
          topic: body.topic,
          sentiment,
          storyTitle: body.storyTitle,
        });

        await users.updateOne(
          { email },
          { $set: { memory: updatedMemory, updatedAt: now } }
        );

        return res.status(200).json({ ok: true, memory: updatedMemory });
      }

      // ── SAVE profile + memory ─────────────────────────────────────────────
      const update = { $set: { updatedAt: now } };

      if (body.name) update.$set.name = body.name;
      if (body.plan) update.$set.plan = body.plan;

      const incomingProfile = body.profile || null;
      const incomingSettings = body.settings || null;

      if (incomingProfile || incomingSettings) {
        const existingProfile = user?.profile || {};
        const settings = incomingSettings || {};
        const source = incomingProfile || existingProfile;
        const profile = {
          summary: source.summary || existingProfile.summary || "",
          profession: source.profession || existingProfile.profession || "",
          goals: source.goals || existingProfile.goals || "",
          topics: source.topics || existingProfile.topics || "",
          avoid: source.avoid || settings.avoid || existingProfile.avoid || "",
          customSources: source.customSources || existingProfile.customSources || "",
          language: source.language || settings.language || existingProfile.language || "English",
          country: source.country || settings.country || existingProfile.country || "",
          newsScope: source.newsScope || settings.newsScope || existingProfile.newsScope || "Mixed",
          digestLength: source.digestLength || settings.digestLength || existingProfile.digestLength || "Standard",
          tone: source.tone || settings.tone || existingProfile.tone || "",
          digestTime: source.digestTime || settings.digestTime || existingProfile.digestTime || "08:00",
          timezone: source.timezone || settings.timezone || existingProfile.timezone || "UTC",
          digestFrequency: source.digestFrequency || settings.digestFrequency || existingProfile.digestFrequency || "daily",
          notifications: settings.notifications ?? existingProfile.notifications ?? true,
          learningEnabled: settings.learningEnabled ?? existingProfile.learningEnabled ?? true,
          analyticsEnabled: settings.analyticsEnabled ?? existingProfile.analyticsEnabled ?? true,
          lockedUntil: body.lockedUntil ? new Date(body.lockedUntil) : existingProfile.lockedUntil || null,
          savedAt: now,
        };
        update.$set.profile = profile;

        const memory = buildMemoryFromOnboarding({
          profession: profile.profession,
          goals: profile.goals,
          topics: profile.topics,
          avoid: profile.avoid,
          customSources: profile.customSources,
          summary: profile.summary,
          language: profile.language,
          country: profile.country,
          newsScope: profile.newsScope,
          digestLength: profile.digestLength,
        });
        update.$set.memory = memory;
      }

      if (user) {
        await users.updateOne({ email }, update);
      } else {
        return res.status(404).json({ error: "User not found. Complete signup first." });
      }

      return res.status(200).json({ ok: true, email });
    }

    return res.status(405).json({ error: "Method not allowed" });

  } catch (err) {
    console.error("user route error:", err);
    return res.status(500).json({ error: err.message || "Server error" });
  }
}

module.exports = handler;
