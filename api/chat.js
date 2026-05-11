export const runtime = "edge";

const GROK_URL = "https://api.x.ai/v1/chat/completions";
const MODEL = "grok-3-latest";
const GROK_TIMEOUT_MS = 45000;

function grokSignal() {
  try {
    return AbortSignal.timeout(GROK_TIMEOUT_MS);
  } catch {
    return undefined;
  }
}

const ONBOARDING_SYSTEM = `You are Signal — a concise, warm concierge for a paid daily email product called Signal (personalized AI industry news, YouTube picks, tools, and one actionable tip).

Goals through natural chat (aim for roughly 6–10 user messages before wrapping):
- Learn their name or how they like to be addressed (optional but nice).
- What they do, seniority, industry, and time zone or region.
- What outcomes they want over the next few months.
- What they consider noise vs signal (topics, depth, risk tolerance).
- Preferred delivery style (tone, length, any hard exclusions).

Rules:
- Ask ONE focused follow-up at a time unless they dump a long message — then acknowledge and ask the single most important next question.
- No bullet interrogation lists; feel like a smart colleague, not a form.
- Do not invent private facts about them; infer only from what they said.
- When you have enough to personalize a daily digest, say clearly that you're almost ready to draft their profile summary for them to approve — but do not output the full structured profile until the app asks for a summary in a separate step.
- Never ask them to paste API keys or credentials.`;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const serverKey = (process.env.GROK_API_KEY || "").trim();
    const clientKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const apiKey = serverKey || clientKey;

    if (!apiKey) {
      return json(
        {
          error:
            "Missing Grok API key. Set GROK_API_KEY in Vercel project settings, or add your key in the app (development only).",
        },
        400
      );
    }

    const action = body.action || "chat";

    if (action === "chat") {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return json({ error: "messages array required" }, 400);
      }

      // Some providers misbehave if the first post-system role is "assistant".
      // Fold the opening assistant bubble into system, then send user-first history.
      let system = ONBOARDING_SYSTEM;
      let conv = messages;
      if (messages[0]?.role === "assistant") {
        system +=
          "\n\nYou already opened the chat with this message (stay consistent; do not repeat it verbatim unless the user asks):\n---\n" +
          messages[0].content +
          "\n---";
        conv = messages.slice(1);
      }
      if (conv.length === 0) {
        return json({ error: "No user messages yet" }, 400);
      }

      const grokRes = await fetch(GROK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: grokSignal(),
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 900,
          messages: [{ role: "system", content: system }, ...conv],
        }),
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return json({ error: err.error?.message || "Grok API error" }, grokRes.status);
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      const userTurns = messages.filter((m) => m.role === "user").length;
      return json({ content, userTurns });
    }

    if (action === "summary") {
      const messages = body.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        return json({ error: "messages required for summary" }, 400);
      }

      const transcript = messages
        .map((m) => `${m.role === "user" ? "User" : "Signal"}: ${m.content}`)
        .join("\n\n");

      const adj =
        typeof body.adjustment === "string" && body.adjustment.trim()
          ? `\n\nThe user requests this revision before approving: ${body.adjustment.trim()}`
          : "";

      const userPrompt = `Here is the full onboarding chat:\n\n${transcript}${adj}\n\n---
Write a profile summary the user will approve before their first digest. Use clear sections:

1) Who they are (role, context)
2) Goals & horizon
3) Topics & sources signal (what to emphasize / avoid)
4) Tone & length (how the daily email should feel)
5) What "today's digest" will typically include (5 short bullets, specific to them)

End with exactly this sentence on its own line:
"Does this sound right? Share any adjustments in chat, or tap Accept to lock this profile for 7 days."`;

      const grokRes = await fetch(GROK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: grokSignal(),
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1200,
          messages: [
            {
              role: "system",
              content:
                "You write tight, accurate user profiles for a digest product. Only use facts from the chat; mark uncertainties briefly if needed.",
            },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return json({ error: err.error?.message || "Grok API error" }, grokRes.status);
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return json({ content });
    }

    if (action === "digest") {
      const profile = body.profile || {};
      const narrative =
        profile.narrative ||
        profile.summary ||
        [
          profile.profession && `Profession: ${profile.profession}`,
          profile.goal && `Goal: ${profile.goal}`,
          profile.challenge && `Challenge: ${profile.challenge}`,
        ]
          .filter(Boolean)
          .join("\n");

      if (!narrative) {
        return json({ error: "profile narrative required" }, 400);
      }

      const today = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      const prompt = `Generate a personalized daily AI digest for this user. Today is ${today}.

APPROVED PROFILE (from onboarding):
${narrative}

Generate their digest in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR DAILY DIGEST · ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 TOP STORIES FOR YOU

① [Specific recent AI / industry story title]
[2-3 sentences: what happened + why it matters for this person]
→ [credible source URL or primary link]

② [Specific recent story title]
[2-3 sentences]
→ [credible source URL]

③ [Specific recent story title]
[2-3 sentences]
→ [credible source URL]


📺 VIDEO WORTH YOUR TIME

"[Specific relevant video title]"
Channel: [YouTube channel] · [duration]
Why watch: [1-2 sentences tied to their goals]
Skip to: [timestamp] for the key insight


💡 ONE THING TO DO TODAY

[One concrete action for today]


🛠️ TOOL OF THE DAY

[Tool name] ([URL])
What: [One line]
Why today: [Fit to their situation]
Free tier: [Yes/No + details]


📊 SIGNAL THIS WEEK

• [Insight 1]
• [Insight 2]
• [Insight 3]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific to their profile. If you lack real-time data, clearly label plausible examples as illustrative and still make them useful.`;

      const grokRes = await fetch(GROK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        signal: grokSignal(),
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 1400,
          messages: [
            {
              role: "system",
              content:
                "You are Signal's digest writer: sharp, non-generic, respects the user's time. Ground claims when possible; avoid hollow hype.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!grokRes.ok) {
        const err = await grokRes.json().catch(() => ({}));
        return json({ error: err.error?.message || "Grok API error" }, grokRes.status);
      }

      const data = await grokRes.json();
      const content = data.choices?.[0]?.message?.content ?? "";
      return json({ content });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    const msg = err?.name === "AbortError" ? "Grok request timed out — try again." : err.message || "Server error";
    return json({ error: msg }, err?.name === "AbortError" ? 504 : 500);
  }
}
