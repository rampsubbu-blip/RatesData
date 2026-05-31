export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { UPSTASH_REDIS_REST_URL: URL, UPSTASH_REDIS_REST_TOKEN: TOKEN } = process.env;

  if (!URL || !TOKEN) {
    // Fallback: no Redis configured — return empty, let client use localStorage
    if (req.method === 'GET') return res.json({ value: null, fallback: true });
    return res.json({ ok: true, fallback: true });
  }

  async function redis(cmd) {
    const r = await fetch(URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(5000),
    });
    return r.json();
  }

  try {
    if (req.method === 'GET') {
      const key = `ftrac:${req.query?.key}`;
      const { result } = await redis(['GET', key]);
      return res.json({ value: result ? JSON.parse(result) : null });
    }

    if (req.method === 'POST') {
      const { key, value } = req.body || {};
      if (!key) return res.status(400).json({ error: 'key required' });
      await redis(['SET', `ftrac:${key}`, JSON.stringify(value)]);
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
