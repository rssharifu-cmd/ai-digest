# Signal — Personalized AI News Digest

Professional onboarding, live-news pipeline, and a dashboard that generates real digests (not placeholder copy).

## Deploy

1. Push to GitHub and import on [Vercel](https://vercel.com).
2. Set environment variables in Vercel → Settings → Environment Variables:

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Yes | Groq API key (digest + chat). `GROK_API_KEY` is still accepted as a legacy alias. |
| `MONGODB_URI` | Yes | User profiles |
| `JWT_SECRET` | Yes | Auth tokens |
| `TAVILY_API_KEY` | Recommended | Live news search |
| `YOUTUBE_API_KEY` | Optional | Video section |
| `RESEND_API_KEY` | For email | Welcome + digest emails |
| `FROM_EMAIL` | For email | Verified sender in Resend |
| `CRON_SECRET` | For cron | Daily send job |
| `ALLOWED_ORIGINS` | Optional | Comma-separated custom domains for browser API calls |

3. Deploy. Cron runs hourly (`/api/cron`) and sends once per user at their configured local digest hour.
4. If Vercel does not auto-deploy after a push, confirm the project is linked to the `main` branch and redeploy the latest commit from the Deployments tab.

## How it works

1. **4-step onboarding** — role, topics, preferences, review  
2. **Short AI chat** — fine-tunes the profile  
3. **Dashboard** — **Generate today** fetches `/api/news` then `/api/chat` with real articles  
4. **Daily email** — cron job uses the same news + Groq pipeline  

## Tech stack

- Frontend: `index.html`, `css/app.css`, `js/app.js`
- API: Vercel serverless (`api/*.js`)
- AI: Groq `llama-3.3-70b-versatile`
- News: Tavily, RSS, Reddit, YouTube
