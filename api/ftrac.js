export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const PAGE_URL = 'https://www.ftrac.co.in/CP_PRI_MEM_TRAD_MARK_WATC_VIEW.aspx';
  const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-IN,en;q=0.9',
  };

  // ── Resolve from/to from query params, fallback to today ──
  const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const toIST  = parseDate(req.query?.to)   || istNow;
  const fromIST = parseDate(req.query?.from) || istNow;

  const fromStr = fmtDate(fromIST);
  const toStr   = fmtDate(toIST);

  // No caching when custom range supplied — always fresh
  const hasCustomRange = req.query?.from || req.query?.to;
  res.setHeader('Cache-Control', hasCustomRange
    ? 'no-store'
    : 's-maxage=300, stale-while-revalidate=60');

  try {
    // ── STEP 1: GET page to grab ASP.NET tokens + cookies ──
    const getRes = await fetch(PAGE_URL, {
      headers: BROWSER_HEADERS,
      signal: AbortSignal.timeout(20000),
    });
    if (!getRes.ok) throw new Error(`GET failed: HTTP ${getRes.status}`);
    const rawHtml = await getRes.text();

    // Collect cookies
    const setCookie = getRes.headers.get('set-cookie') || '';
    const cookies = setCookie.split(/,(?=[^ ].*?=)/)
      .map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');

    // ── STEP 2: Scrape all form fields ──
    const fields = {};

    // ASP.NET hidden fields
    for (const name of ['__VIEWSTATE','__VIEWSTATEGENERATOR','__EVENTVALIDATION','__EVENTTARGET','__EVENTARGUMENT']) {
      const m = rawHtml.match(new RegExp(`id="${name}"[^>]*value="([^"]*)"`, 'i'))
             || rawHtml.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`, 'i'))
             || rawHtml.match(new RegExp(`value="([^"]*)"[^>]*name="${name}"`, 'i'));
      if (m) fields[name] = m[1];
    }

    // All other inputs
    const inputRe = /<input([^>]+)>/gi;
    let im;
    while ((im = inputRe.exec(rawHtml)) !== null) {
      const a = im[1];
      const nameM  = a.match(/name="([^"]*)"/i);
      const valueM = a.match(/value="([^"]*)"/i);
      const typeM  = a.match(/type="([^"]*)"/i);
      const type   = typeM ? typeM[1].toLowerCase() : 'text';
      if (nameM && !['button','image'].includes(type)) {
        fields[nameM[1]] = valueM ? valueM[1] : '';
      }
    }

    // Selects
    const selectRe = /<select[^>]+name="([^"]*)"[^>]*>([\s\S]*?)<\/select>/gi;
    let sm;
    while ((sm = selectRe.exec(rawHtml)) !== null) {
      const selBody = sm[2];
      const selM  = selBody.match(/<option[^>]+selected[^>]*value="([^"]*)"/i);
      const firstM = selBody.match(/<option[^>]+value="([^"]*)"/i);
      fields[sm[1]] = selM ? selM[1] : (firstM ? firstM[1] : '');
    }

    // ── STEP 3: Detect date format used by the page & inject from/to dates ──
    // Figure out the native format from any existing date field value
    let detectedFormat = 'DD/MM/YYYY'; // default
    for (const key of Object.keys(fields)) {
      const v = fields[key];
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) { detectedFormat = 'DD/MM/YYYY'; break; }
      if (/^\d{2}-\d{2}-\d{4}$/.test(v))   { detectedFormat = 'DD-MM-YYYY'; break; }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v))   { detectedFormat = 'YYYY-MM-DD'; break; }
      if (/^\d{2}-[A-Za-z]{3}-\d{4}$/.test(v)) { detectedFormat = 'DD-Mon-YYYY'; break; }
    }

    const fromFormatted = applyFormat(fromIST, detectedFormat);
    const toFormatted   = applyFormat(toIST,   detectedFormat);

    // Inject into every date-like field
    // Fields with "from"/"start"/"begin" → fromDate; "to"/"end" → toDate; plain "date" → toDate
    for (const key of Object.keys(fields)) {
      const kl = key.toLowerCase();
      if (kl.includes('date') || kl.includes('dt')) {
        if (kl.includes('from') || kl.includes('start') || kl.includes('begin') || kl.includes('frm')) {
          fields[key] = fromFormatted;
        } else if (kl.includes('to') || kl.includes('end') || kl.includes('till')) {
          fields[key] = toFormatted;
        } else {
          // Single date field — use toDate (most recent)
          fields[key] = toFormatted;
        }
      }
    }

    // Find + include submit button
    const btnRe = /<input([^>]+type="submit"[^>]*)>/gi;
    let bm;
    while ((bm = btnRe.exec(rawHtml)) !== null) {
      const a    = bm[1];
      const nameM  = a.match(/name="([^"]*)"/i);
      const valueM = a.match(/value="([^"]*)"/i);
      if (nameM) { fields[nameM[1]] = valueM ? valueM[1] : 'Search'; break; }
    }

    // ── STEP 4: POST ──
    const postRes = await fetch(PAGE_URL, {
      method: 'POST',
      headers: {
        ...BROWSER_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': PAGE_URL,
        'Origin': 'https://www.ftrac.co.in',
        ...(cookies ? { 'Cookie': cookies } : {}),
      },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(25000),
    });

    if (!postRes.ok) throw new Error(`POST failed: HTTP ${postRes.status}`);

    const resultHtml = await postRes.text();
    res.setHeader('X-Date-From', fromFormatted);
    res.setHeader('X-Date-To',   toFormatted);
    res.setHeader('X-Format',    detectedFormat);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(resultHtml);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

// ── Helpers ──
function parseDate(str) {
  if (!str) return null;
  // Accepts DD/MM/YYYY or YYYY-MM-DD
  const a = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (a) return new Date(Date.UTC(+a[3], +a[2]-1, +a[1]));
  const b = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (b) return new Date(Date.UTC(+b[1], +b[2]-1, +b[3]));
  return null;
}

function fmtDate(d) {
  const dd = String(d.getUTCDate()).padStart(2,'0');
  const mm = String(d.getUTCMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function applyFormat(d, fmt) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dd   = String(d.getUTCDate()).padStart(2,'0');
  const mm   = String(d.getUTCMonth()+1).padStart(2,'0');
  const yyyy = d.getUTCFullYear();
  if (fmt === 'DD/MM/YYYY')  return `${dd}/${mm}/${yyyy}`;
  if (fmt === 'DD-MM-YYYY')  return `${dd}-${mm}-${yyyy}`;
  if (fmt === 'YYYY-MM-DD')  return `${yyyy}-${mm}-${dd}`;
  if (fmt === 'DD-Mon-YYYY') return `${dd}-${MONTHS[d.getUTCMonth()]}-${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}
