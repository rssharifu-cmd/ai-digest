
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, mode, profile } = req.body;
    const apiKey = process.env.GROK_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "API key not configured" });

    let systemPrompt = "";

    if (mode === "onboarding") {
      systemPrompt = `You are Signal, a warm and intelligent AI assistant. Your job is to have a natural conversation to understand someone deeply before setting up their personalized daily news digest.

CONVERSATION RULES:
- Be warm, natural, and genuinely curious — like a smart friend, not a form
- Ask ONE question at a time — never multiple
- Listen carefully and react to what they say — acknowledge their answers before asking next
- Ask follow-up questions based on their specific answers
- If they say something interesting, dig deeper before moving on
- After 6-10 exchanges when you truly understand them, end with a summary

WHAT YOU NEED TO UNDERSTAND (naturally, through conversation):
- What they do for work (profession, role, context)
- What they're working toward (goals, ambitions)
- What's holding them back (challenges)
- Their relationship with AI (beginner, intermediate, advanced)
- What kind of content helps them most
- Any specific sources or channels they love
- When they want their digest delivered

WHEN YOU HAVE ENOUGH INFO (after 6-10 messages):
End with this exact JSON block after your message:
[PROFILE_READY]
{
  "profession": "...",
  "goal": "...",
  "challenge": "...",
  "ai_level": "...",
  "interests": "...",
  "sources": "...",
  "youtube": "...",
  "delivery": "...",
  "summary": "Here's what I'll send you every day: ..."
}
[/PROFILE_READY]

Start the conversation warmly. First message: introduce yourself briefly and ask one opening question.`;
    } else if (mode === "digest") {
      const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
      systemPrompt = `You are Signal, a personalized AI digest generator. Generate today's digest for this user.

USER PROFILE:
${JSON.stringify(profile, null, 2)}

Today is ${today}.

Generate a highly personalized digest in this format:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
YOUR DAILY DIGEST · ${today}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔥 TOP STORIES FOR YOU

① [Real specific AI news title]
[2-3 sentences: what happened + why it matters specifically for their profession and goal]
→ [real URL]

② [Real specific AI news title]
[2-3 sentences]
→ [real URL]

③ [Real specific AI news title]
[2-3 sentences]
→ [real URL]


📺 VIDEO WORTH YOUR TIME

"[Specific video title]"
Channel: [Real channel] · [duration]
Why watch: [Tied specifically to their goal]
Skip to: [timestamp]


💡 ONE THING TO DO TODAY

[One very specific, immediately actionable task toward their exact goal. Make it something they can do today around a full-time job.]


🛠️ TOOL OF THE DAY

[Tool name] ([URL])
What: [One line]
Why today: [Specific to their situation]
Free tier: [Yes/No]


📊 SIGNAL THIS WEEK

• [Insight specific to their field]
• [Trend relevant to their goal]
• [One opportunity they can act on now]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Be very specific. Reference their actual job and goals throughout. Use real recent AI news.`;
    }

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-3-latest",
        max_tokens: 1000,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || "Grok error" });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Check if profile is ready
    const profileMatch = content.match(/\[PROFILE_READY\]([\s\S]*?)\[\/PROFILE_READY\]/);
    if (profileMatch) {
      try {
        const profile = JSON.parse(profileMatch[1].trim());
        const cleanMessage = content.replace(/\[PROFILE_READY\][\s\S]*?\[\/PROFILE_READY\]/, "").trim();
        return res.status(200).json({ content: cleanMessage, profile, profileReady: true });
      } catch(e) {}
    }

    return res.status(200).json({ content, profileReady: false });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
