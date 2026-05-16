/**
 * Vercel Node.js Serverless — POST /api/chat
 * GET /api/chat — quick health JSON
 */

const GROK_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";
const GROK_TIMEOUT_MS = 45000;

// Pricing plan features reference (used for context)
// Starter $4.99/mo: daily digest, AI onboarding, profile refresh 7 days, 3 digest sections
// Pro $9.99/mo: everything + 5 sections, WhatsApp (soon), priority support, fine-tune anytime

const ONBOARDING_SYSTEM = `You are Signal — a warm, concise assistant helping a user set up their personalized daily news digest.

The user has already filled in a quick profile form (name, profession, topics, sources). You will receive that as context.

Your job: have a short, natural follow-up conversation (3–5 messages max) to clarify or enrich the profile. Then confirm and wrap up.

Rules:
- Ask ONE question at a time, maximum.
- Never ask for their email — they already gave it when signing up.
- Never give instructions, tasks, or advice like a mentor ("you should try X", "consider doing Y"). You are a listener, not a coach.
- Do not repeat questions about things already covered in the profile form.
- Be curious about their *specific* context — depth, nuance, what they find noisy, what excites them.
- Keep replies SHORT (2–4 sentences max). No bullet lists unless wrapping up.
- When you feel you have enough to build a good digest profile (after 3–5 user messages), say warmly that you have everything and you're ready to draft their profile summary. Do not output the summary yet — the app will trigger that separately.
- Never ask them to paste API keys or credentials.`;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function grokFetch(apiKey, payload) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), GROK_TIMEOUT_MS);
  try {
    return await fetch(GROK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

function parseBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = typeof req.body === "string" ? req.body : "";
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      route: "/api/chat",
      runtime: "nodejs",
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = parseBody(req);
    const apiKey = (process.env.GROK_API_KEY || "").trim();

    if (!apiKey) {
      return res.status(400).json({
        error: "Missing API key. Set GROK_API_KEY in Vercel project settings.",
      });
    }

    const action = body.action || "chat";

    // ── CHAT ─────────────────────────────────────────────────────────────────
    if (action === "chat") {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages array required" });
      }

      // Profile form data passed from frontend
      const profileForm = body.profileForm || {};
      const profileContext = Object.keys(profileForm).length
        ? `\n\nPROFILE FORM ALREADY SUBMITTED:\n${Object.entries(profileForm)
            .map(([k, v]) => `- ${k}: ${v}`)
            .filter(([, v]) => v)
            .join("\n")}`
        : "";

      let system = ONBOARDING_SYSTEM + profileContext;
      let conv = messages;

      if (messages[0]?.role === "assistant") {
        system +=
          "\n\nYou already opened the chat with this message (stay consistent):\n---\n" +
          messages[0].content +
          "\n---";
        conv = messages.slice(1);
      }
      if (conv.length === 0) return res.status(400).json({ error: "No user messages yet" });

      const userTurns = messages.filter((m) => m.role === "user").length;

      // After 4+ turns, hint AI to wrap up if it hasn't
      if (userTurns >= 4) {
        system +=
          "\n\nYou have collected enough information. In your next reply (if not already done), warmly tell the user you have everything needed and are ready to generate their profile summary. Keep it to 1–2 sentences.";
      }

      const grokRes = await grokFetch(apiKey, {
        model: MODEL,
        max_tokens: 600,
        messages: [{ role: "system", content: system }, ...conv],
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return res.status(grokRes.status).json({ error: err.error?.message || "Groq API error" });
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";

      // Detect if AI is signalling wrap-up
      const wrapKeywords = ["ready to draft", "ready to generate", "have everything", "build your profile", "draft your profile"];
      const readyForSummary = userTurns >= 3 && wrapKeywords.some(k => content.toLowerCase().includes(k));

      return res.status(200).json({
        content,
        userTurns,
        readyForSummary,
      });
    }

    // ── SUMMARY ──────────────────────────────────────────────────────────────
    if (action === "summary") {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: "messages required for summary" });
      }

      const profileForm = body.profileForm || {};
      const profileFormText = Object.keys(profileForm).length
        ? `PROFILE FORM:\n${Object.entries(profileForm)
            .map(([k, v]) => `- ${k}: ${v}`)
            .filter(([, v]) => v)
            .join("\n")}\n\n`
        : "";

      const transcript = messages
        .map((m) => `${m.role === "user" ? "User" : "Signal"}: ${m.content}`)
        .join("\n\n");

      const adj =
        typeof body.adjustment === "string" && body.adjustment.trim()
          ? `\n\nThe user requests this revision: ${body.adjustment.trim()}`
          : "";

      const userPrompt = `${profileFormText}FOLLOW-UP CHAT:\n${transcript}${adj}\n\n---
Write a concise profile summary the user will approve before their first digest. Use clear sections:

1) Who they are (name if given, role, context)
2) Topics & sources to emphasize
3) What to avoid / filter out
4) Custom sources (websites, YouTube channels, X accounts) if mentioned
5) Tone & format preference for daily email
6) What their digest will typically include (4–5 short bullets)

End with exactly this line on its own:
"Does this look right? Adjust in chat, or tap Confirm to lock your profile."`;

      const grokRes = await grokFetch(apiKey, {
        model: MODEL,
        max_tokens: 1000,
        messages: [
          {
            role: "system",
            content:
              "You write tight, accurate user profiles for a personalized digest product. Use only facts from the form and chat. Be specific, not generic.",
          },
          { role: "user", content: userPrompt },
        ],
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return res.status(grokRes.status).json({ error: err.error?.message || "Groq API error" });
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return res.status(200).json({ content });
    }

    // ── DIGEST ───────────────────────────────────────────────────────────────
    if (action === "digest") {
      const profile = body.profile || {};
      const narrative =
        profile.narrative ||
        profile.summary ||
        [
          profile.profession && `Profession: ${profile.profession}`,
          profile.goal && `Goal: ${profile.goal}`,
        ]
          .filter(Boolean)
          .join("\n");

      if (!narrative) return res.status(400).json({ error: "profile narrative required" });

      const today = new Date().toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      });

      const isPro = body.plan === "pro";

      const prompt = `Generate a personalized daily AI digest for this user. Today is ${today}.

PROFILE:
${narrative}

Plan: ${isPro ? "Pro (5 sections)" : "Starter (3 sections)"}

Generate their digest in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR SIGNAL · ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 TOP STORIES

① [Specific relevant story title]
[2–3 sentences: what happened + why it matters for this person]
→ [source]

② [Story title]
[2–3 sentences]
→ [source]

③ [Story title]
[2–3 sentences]
→ [source]
${
  isPro
    ? `

📺 VIDEO WORTH YOUR TIME

"[Relevant video title]"
Channel: [YouTube channel] · [duration]
Why: [1–2 sentences tied to their goals]
Skip to: [timestamp]

🛠️ TOOL OF THE DAY

[Tool name] ([URL])
What: [One line]
Why today: [Fit to their situation]
Free tier: [Yes/No]`
    : ""
}

💡 ONE THING TO DO TODAY

[One concrete action relevant to their context]

📊 THIS WEEK

• [Insight 1]
• [Insight 2]
• [Insight 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific to their profile. Label illustrative examples clearly if real-time data is unavailable.`;

      const grokRes = await grokFetch(apiKey, {
        model: MODEL,
        max_tokens: isPro ? 1600 : 1100,
        messages: [
          {
            role: "system",
            content: "You are Signal's digest writer: sharp, non-generic, respects the user's time.",
          },
          { role: "user", content: prompt },
        ],
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return res.status(grokRes.status).json({ error: err.error?.message || "Groq API error" });
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return res.status(200).json({ content });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    const msg =
      err?.name === "AbortError" ? "Request timed out — try again." : err.message || "Server error";
    return res.status(err?.name === "AbortError" ? 504 : 500).json({ error: msg });
  }
}

module.exports = handler;
