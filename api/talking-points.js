export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { ANTHROPIC_API_KEY } = process.env;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { issuers = [], marketAvgWay, dateRange } = req.body || {};
  if (!issuers.length) return res.status(400).json({ error: 'No issuers provided' });

  const issuerLines = issuers.map(i =>
    `- ${i.issuer} (${i.industry}): WAY ${(i.way||0).toFixed(4)}% | ` +
    `30d range ${(i.minWay||0).toFixed(4)}–${(i.maxWay||0).toFixed(4)}% | ` +
    `spread ${(i.spread||0).toFixed(0)}bps | position: ${i.position} | ` +
    `total issued ₹${((i.totalAmt||0)/1e7).toFixed(0)} Cr`
  ).join('\n');

  const prompt = `You are a fixed income relationship manager at an Indian bank. Generate concise, actionable loan pricing talking points based on real CP/CD market data.

Data period: ${dateRange || 'recent'}
Market average WAY: ${(marketAvgWay||0).toFixed(4)}%

Issuer data:
${issuerLines}

Context:
- CP WAY = the rate at which these corporates are borrowing short-term in the market
- Typical bank loan spread over CP: PSU/Govt 30–50bps, Banks 40–60bps, Manufacturing 60–90bps, NBFC 70–110bps, Housing Finance 80–120bps
- "At peak" means the issuer is borrowing at the top of their recent range — supports a higher loan pricing ask
- "Near floor" means tight liquidity conditions for the issuer — less room to negotiate
- "Mid range" means normal — reference the spread to market avg as the anchor

Generate exactly ${Math.min(issuers.length + 1, 4)} talking points. Each must:
1. Name the specific issuer and cite actual yield numbers
2. State what the CP market data implies for loan pricing (suggest a specific range)
3. Be 2–3 sentences, direct and factual

Respond ONLY with a valid JSON array, no markdown:
[{ "issuer": "...", "title": "...", "body": "...", "type": "peak|floor|watch|opportunity" }]`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(30000),
    });

    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);

    const raw = (data.content?.[0]?.text || '').replace(/```json|```/g, '').trim();
    const points = JSON.parse(raw);
    return res.json({ points });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
