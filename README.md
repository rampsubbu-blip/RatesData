# FTRAC Money Market PWA

Live CP/CD primary & secondary issuance data from CCIL F-TRAC with personal rate tracking and AI-powered loan pricing guidance.

## Pages

| Page | File | Purpose |
|---|---|---|
| Data | `index.html` | Fetch live FTRAC data across 4 instrument tabs with date range filter |
| My accounts | `accounts.html` | Personal watchlist with yield trend chart and heatmap |
| Guidance | `guidance.html` | Borrowing range strips, positioning, AI talking points, rate alerts |

## API routes

| Route | Purpose |
|---|---|
| `GET /api/ftrac` | Fetches FTRAC page server-side (GET+POST with date injection) |
| `GET /api/user?key=` | Read persisted user preference from Upstash Redis |
| `POST /api/user` | Write user preference to Upstash Redis |
| `POST /api/talking-points` | Generate AI talking points via Claude API |

## Deploy

### 1. Push to GitHub
```bash
git add .
git commit -m "feat: full rebuild with accounts, guidance, Upstash persistence, AI talking points"
git push
```

### 2. Set up Upstash (free — takes 2 minutes)
1. Go to [console.upstash.com](https://console.upstash.com) → Create account → Create Database
2. Choose **Redis** → Region: **Asia Pacific (Mumbai)** → Free tier
3. Copy **REST URL** and **REST Token** from the database page

### 3. Set up Anthropic API key (for AI talking points)
1. Go to [console.anthropic.com](https://console.anthropic.com) → API Keys → Create key
2. Copy the key

### 4. Add environment variables to Vercel
In your Vercel project → Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `UPSTASH_REDIS_REST_URL` | Your Upstash REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Your Upstash REST Token |
| `ANTHROPIC_API_KEY` | Your Anthropic API key |

### 5. Redeploy
Vercel auto-redeploys on push. Or click **Redeploy** in the Vercel dashboard after adding env vars.

## How it works

```
Browser → GET /api/ftrac?instrument=cp-primary&from=...&to=...
        → Vercel function fetches FTRAC (GET for tokens + POST with dates)
        → Returns HTML → Browser parses table → sessionStorage

Browser → GET/POST /api/user
        → Vercel function reads/writes Upstash Redis
        → Watchlist, thresholds, industry overrides persist across devices

Browser → POST /api/talking-points
        → Vercel function sends issuer positioning data to Claude API
        → Returns JSON array of 3-4 actionable talking points
```

## Graceful fallback
If Upstash is not configured, `/api/user` returns `{ fallback: true }` and the app falls back to localStorage — so it works without Redis, just not cross-device.

If `ANTHROPIC_API_KEY` is not set, the Generate button shows an error message — the rest of the app continues to work normally.
