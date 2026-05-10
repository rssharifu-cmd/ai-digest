export const runtime = "edge";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const { profile, apiKey } = body;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "No API key provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const today = new Date().toLocaleDateString("en-US", {
      weekday: "long", month: "long", day: "numeric", year: "numeric"
    });

    const prompt = `Generate a personalized daily AI digest for this user. Today is ${today}.

USER PROFILE:
- Profession: ${profile.profession}
- 6-month goal: ${profile.goal}
- Biggest challenge: ${profile.challenge}
- Preferred news sources: ${profile.sources || "TechCrunch, Hacker News, a16z blog"}
- YouTube channels: ${profile.youtube || "not specified"}
- Delivery time: ${profile.delivery}

Generate their digest in this EXACT format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR DAILY DIGEST · ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 TOP STORIES FOR YOU

① [Specific recent AI news title]
[2-3 sentences: what happened + why it matters for their specific profession and goal]
→ [real source URL]

② [Specific recent AI news title]
[2-3 sentences]
→ [real source URL]

③ [Specific recent AI news title]
[2-3 sentences]
→ [real source URL]


📺 VIDEO WORTH YOUR TIME

"[Specific relevant video title]"
Channel: [Real YouTube channel] · [duration]
Why watch: [1-2 sentences tied to their specific goal]
Skip to: [timestamp] for the key insight


💡 ONE THING TO DO TODAY

[One very specific, immediately actionable task that moves them toward their goal. Reference their actual profession.]


🛠️ TOOL OF THE DAY

[Tool name] ([URL])
What: [One line]
Why today: [Why it fits their specific situation]
Free tier: [Yes/No + details]


📊 SIGNAL THIS WEEK

• [Industry insight bullet 1 — specific to their field]
• [Industry insight bullet 2]
• [Opportunity specific to their goal]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be specific. Reference their actual job and goals throughout. Use real, recent AI news and tools.`;

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
            content: "You are a personalized AI news digest generator. You create specific, actionable daily digests tailored to each user's profession and goals. Always reference real AI tools, companies, and recent developments.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!grokRes.ok) {
      const err = await grokRes.json();
      return new Response(JSON.stringify({ error: err.error?.message || "Grok API error" }), {
        status: grokRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const data = await grokRes.json();
    const content = data.choices[0].message.content;

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
