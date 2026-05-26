# FTRAC Primary CP Issuances PWA

A live Progressive Web App that fetches and displays **Primary Commercial Paper issuances** from the [CCIL F-TRAC platform](https://www.ftrac.co.in/CP_PRI_MEM_TRAD_MARK_WATC_VIEW.aspx), with real-time issuer search and filtering.

## Features

- **Live data** — fetches directly from FTRAC on load and auto-refreshes every 5 minutes
- **Issuer search** — instant filter with highlighted matches
- **Sortable columns** — click any header to sort (numeric-aware)
- **Metrics summary** — total records, unique issuers, total ₹ amount, deal date range
- **PWA** — installable on desktop and mobile, offline shell support
- **No CORS issues** — data fetched server-side via a Vercel serverless function

## Project Structure

```
ftrac-cp-pwa/
├── api/
│   └── ftrac.js        ← Vercel serverless function (fetches FTRAC page)
├── public/
│   ├── index.html      ← PWA frontend
│   ├── manifest.json   ← PWA manifest
│   └── sw.js           ← Service worker
├── package.json
├── vercel.json
└── README.md
```

## Deploy in 3 steps

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
gh repo create ftrac-cp-pwa --public --push --source=.
```

Or create a repo on [github.com](https://github.com/new) and follow the instructions to push.

### 2. Deploy to Vercel

**Option A — Vercel dashboard (easiest):**
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Leave all settings as default — Vercel auto-detects the config
4. Click **Deploy**

**Option B — Vercel CLI:**
```bash
npm i -g vercel
vercel --prod
```

### 3. Done

Your app will be live at `https://ftrac-cp-pwa.vercel.app` (or your chosen domain).

## Local development

```bash
npm i -g vercel
vercel dev
```

This runs both the static frontend and the `/api/ftrac` serverless function locally at `http://localhost:3000`.

## How it works

```
Browser → GET /api/ftrac → Vercel Function → fetches ftrac.co.in → returns HTML
Browser parses the HTML table → renders filtered results
```

The serverless function in `api/ftrac.js` fetches the FTRAC ASPX page server-side (no CORS restriction on the server), then passes the HTML back to the browser. The browser parses the largest `<table>` it finds and renders the data.

The API response is cached by Vercel's edge network for **5 minutes** (`s-maxage=300`), so repeated loads are instant and don't hammer FTRAC.

## Customisation

| What | Where |
|------|-------|
| Issuer column index | `ISSUER_COL` constant in `public/index.html` |
| Rows per page | `PAGE_SIZE` constant in `public/index.html` |
| Auto-refresh interval | `setInterval(loadData, 5 * 60 * 1000)` in `public/index.html` |
| FTRAC source URL | `FTRAC_URL` constant in `api/ftrac.js` |
| CDN cache duration | `s-maxage` in `vercel.json` headers |
