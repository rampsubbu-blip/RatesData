export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const PAGE_URL = 'https://www.ftrac.co.in/CP_PRI_MEM_TRAD_MARK_WATC_VIEW.aspx';
  const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
  };

  try {
    // ── STEP 1: GET the page to collect ASP.NET form tokens + cookies ──
    const getRes = await fetch(PAGE_URL, {
      headers: HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!getRes.ok) throw new Error(`GET failed: HTTP ${getRes.status}`);

    const rawHtml = await getRes.text();

    // Collect session cookies
    const setCookie = getRes.headers.get('set-cookie') || '';
    const cookies = setCookie
      .split(/,(?=[^ ].*?=)/)
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    // ── STEP 2: Extract ALL form fields (hidden + visible) ──
    const fields = {};

    // Hidden ASP.NET infrastructure fields
    for (const name of ['__VIEWSTATE', '__VIEWSTATEGENERATOR', '__EVENTVALIDATION', '__EVENTTARGET', '__EVENTARGUMENT']) {
      const m = rawHtml.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i'))
             || rawHtml.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'))
             || rawHtml.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`, 'i'));
      if (m) fields[name] = m[1];
    }

    // Extract every other <input> in the form
    const inputRe = /<input([^>]+)>/gi;
    let im;
    while ((im = inputRe.exec(rawHtml)) !== null) {
      const attrs = im[1];
      const nameM  = attrs.match(/name="([^"]*)"/i);
      const valueM = attrs.match(/value="([^"]*)"/i);
      const typeM  = attrs.match(/type="([^"]*)"/i);
      const type   = typeM ? typeM[1].toLowerCase() : 'text';
      if (nameM && type !== 'button' && type !== 'image') {
        fields[nameM[1]] = valueM ? valueM[1] : '';
      }
    }

    // Extract <select> default selected values
    const selectRe = /<select[^>]+name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi;
    let sm;
    while ((sm = selectRe.exec(rawHtml)) !== null) {
      const selName = sm[1];
      const selBody = sm[2];
      const selM = selBody.match(/<option[^>]+selected[^>]*value="([^"]*)"/i);
      const firstM = selBody.match(/<option[^>]+value="([^"]*)"/i);
      fields[selName] = selM ? selM[1] : (firstM ? firstM[1] : '');
    }

    // ── STEP 3: Inject today's date into every date-like field ──
    const now = new Date();
    // India IST offset
    const ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const dd   = String(ist.getUTCDate()).padStart(2, '0');
    const mm   = String(ist.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = ist.getUTCFullYear();

    const dateSlash = `${dd}/${mm}/${yyyy}`;   // 26/05/2026
    const dateDash  = `${dd}-${mm}-${yyyy}`;   // 26-05-2026
    const dateISO   = `${yyyy}-${mm}-${dd}`;   // 2026-05-26

    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateMonStr = `${dd}-${months[ist.getUTCMonth()]}-${yyyy}`; // 26-May-2026

    // Find date-related field names and set them
    for (const key of Object.keys(fields)) {
      const kl = key.toLowerCase();
      if (kl.includes('date') || kl.includes('dt') || kl.includes('from') || kl.includes('to')) {
        const existing = fields[key];
        // Try to match the format the page uses
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(existing) || existing === '') {
          fields[key] = dateSlash;
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(existing)) {
          fields[key] = dateDash;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) {
          fields[key] = dateISO;
        } else if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(existing)) {
          fields[key] = dateMonStr;
        } else {
          fields[key] = dateSlash; // default
        }
      }
    }

    // Find and include the submit/search button
    const btnRe = /<input([^>]+type="submit"[^>]*)>/gi;
    let bm;
    while ((bm = btnRe.exec(rawHtml)) !== null) {
      const attrs = bm[1];
      const nameM  = attrs.match(/name="([^"]*)"/i);
      const valueM = attrs.match(/value="([^"]*)"/i);
      if (nameM) {
        fields[nameM[1]] = valueM ? valueM[1] : 'Search';
        break; // only first submit button
      }
    }

    // ── STEP 4: POST with the completed form ──
    const body = new URLSearchParams(fields).toString();

    const postRes = await fetch(PAGE_URL, {
      method: 'POST',
      headers: {
        ...HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': PAGE_URL,
        'Origin': 'https://www.ftrac.co.in',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      body,
      signal: AbortSignal.timeout(25000),
    });

    if (!postRes.ok) throw new Error(`POST failed: HTTP ${postRes.status}`);

    const resultHtml = await postRes.text();

    // Surface debug info in a header so we can inspect if needed
    res.setHeader('X-Fields-Used', Object.keys(fields).join(',').substring(0, 500));
    res.setHeader('X-Date-Injected', dateSlash);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(resultHtml);

  } catch (err) {
    return res.status(500).json({ error: err.message, stack: err.stack });
  }
}
