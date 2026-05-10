# AI Digest — Personalized Growth Intelligence

Your personal AI assistant that learns who you are and sends a daily tailored digest.

## Deploy in 5 Minutes

### Step 1 — Upload to GitHub
1. Go to github.com → New repository
2. Name it `ai-digest`
3. Upload all these files

### Step 2 — Deploy to Vercel
1. Go to vercel.com
2. Click "Add New Project"
3. Import your GitHub repo
4. Click Deploy — done!

### Step 3 — Add Your Grok API Key
1. Open your live site
2. Click "API" button in top right
3. Paste your xAI Grok API key
4. Your digest is now AI-powered!

## How It Works
- User answers 8 questions (free text, no fixed options)
- AI generates a personalized profile summary
- User accepts or gives feedback
- Profile locks for 7 days
- Daily digest delivered via email (coming soon)

## Tech Stack
- Frontend: Vanilla HTML/CSS/JS (no framework needed)
- Backend: Vercel Edge Function (proxy for Grok API)
- AI: xAI Grok API
- Hosting: Vercel (free tier)

## Files
- `index.html` — Full frontend app
- `api/digest.js` — Backend API proxy
- `vercel.json` — Vercel configuration
