export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const response = await fetch(
      'https://www.ftrac.co.in/CP_PRI_MEM_TRAD_MARK_WATC_VIEW.aspx',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-IN,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: `FTRAC returned HTTP ${response.status}` });
    }

    const html = await response.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
