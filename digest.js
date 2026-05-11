export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { profile, prompt, mode } = req.body;

    // API Key comes from Vercel Environment Variable — never exposed to frontend
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API key not configured on server" });

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const digestPrompt = mode === "summary"
      ? prompt
      : `Generate a personalized daily AI digest. Today is ${today}.

USER PROFILE:
- Profession: ${profile?.profession}
- Goal: ${profile?.goal}
- Challenge: ${profile?.challenge}
- Preferred Sources: ${profile?.sources || "TechCrunch, Hacker News, a16z"}
- YouTube Channels: ${profile?.youtube || "not specified"}

Write the digest in this exact format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR DAILY DIGEST · ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 TOP STORIES FOR YOU

① [Real AI news title]
[2-3 sentences: what happened + why it matters for their specific profession and goal]
→ [real source URL]

② [Real AI news title]
[2-3 sentences]
→ [real source URL]

③ [Real AI news title]
[2-3 sentences]
→ [real source URL]


📺 VIDEO WORTH YOUR TIME

"[Specific video title]"
Channel: [Real YouTube channel] · [duration]
Why watch: [Tied to their specific goal]
Skip to: [timestamp] for the key part


💡 ONE THING TO DO TODAY

[One specific, immediately actionable task toward their goal]


🛠️ TOOL OF THE DAY

[Tool name] ([URL])
What: [One line description]
Why today: [Why it fits their situation]
Free tier: [Yes/No + details]


📊 SIGNAL THIS WEEK

• [Industry insight specific to their field]
• [Trend relevant to their goal]
• [One opportunity they can act on]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be very specific. Reference their actual profession and goals throughout.`;

    const grokRes = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-latest",
        max_tokens: 1200,
        messages: [
          {
            role: "system",
            content: "You are a personalized AI news digest generator. Create specific, actionable daily digests tailored to each user's profession and goals. Always use real AI tools and recent developments.",
          },
          { role: "user", content: digestPrompt },
        ],
      }),
    });

    if (!grokRes.ok) {
      const err = await grokRes.json();
      return res.status(grokRes.status).json({ error: err.error?.message || "Grok API error" });
    }

    const data = await grokRes.json();
    return res.status(200).json({ content: data.choices[0].message.content });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
