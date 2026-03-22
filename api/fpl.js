export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'No path provided' });

  const url = `https://fantasy.premierleague.com/api/${path}`;

  // Build cookie string from env vars if available
  // Set FPL_ACCESS_TOKEN and FPL_REFRESH_TOKEN in Vercel environment variables
  const cookieParts = [];
  if (process.env.FPL_ACCESS_TOKEN)  cookieParts.push(`access_token=${process.env.FPL_ACCESS_TOKEN}`);
  if (process.env.FPL_REFRESH_TOKEN) cookieParts.push(`refresh_token=${process.env.FPL_REFRESH_TOKEN}`);
  if (process.env.FPL_PL_PROFILE)    cookieParts.push(`pl_profile=${process.env.FPL_PL_PROFILE}`);
  const cookieHeader = cookieParts.join('; ');

  const attempts = [
    // Attempt 1: Full Chrome fingerprint + auth cookies (if available)
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://fantasy.premierleague.com/my-team',
      'Origin': 'https://fantasy.premierleague.com',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Ch-Ua': '"Chromium";v="123","Google Chrome";v="123"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
    },
    // Attempt 2: Safari fingerprint + auth cookies
    {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      'Accept': 'application/json',
      'Accept-Language': 'en-GB,en;q=0.9',
      'Referer': 'https://fantasy.premierleague.com/',
      'Origin': 'https://fantasy.premierleague.com',
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
    },
    // Attempt 3: Firefox fingerprint
    {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-GB,en;q=0.5',
      'Referer': 'https://fantasy.premierleague.com/',
      'Origin': 'https://fantasy.premierleague.com',
      ...(cookieHeader ? { 'Cookie': cookieHeader } : {}),
    },
    // Attempt 4: Minimal headers — last resort
    {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      'Accept': '*/*',
    },
  ];

  // Exponential backoff helper
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (let i = 0; i < attempts.length; i++) {
    // Small backoff between retries (0ms, 300ms, 700ms, 1500ms)
    if (i > 0) await wait(300 * i);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: attempts[i],
        redirect: 'follow',
      });

      if (response.ok) {
        const data = await response.json();
        res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
        res.setHeader('X-Attempt', String(i + 1));
        res.setHeader('X-Auth', cookieHeader ? 'cookie' : 'none');
        return res.status(200).json(data);
      }

      // Got a response but not OK — log and continue unless it's the last attempt
      console.warn(`Attempt ${i + 1} failed: HTTP ${response.status} for ${path}`);

      if (i === attempts.length - 1) {
        const hint =
          response.status === 403
            ? cookieHeader
              ? 'Cookies present but still blocked — they may have expired. Refresh them in Vercel env vars.'
              : 'No auth cookies set. Add FPL_ACCESS_TOKEN and FPL_REFRESH_TOKEN in Vercel environment variables.'
            : response.status === 429
            ? 'FPL is rate-limiting this IP. Wait a few minutes and try again.'
            : '';
        return res.status(response.status).json({
          error: `FPL API returned ${response.status} after ${attempts.length} attempts`,
          hint,
          path,
        });
      }
    } catch (err) {
      console.error(`Attempt ${i + 1} threw:`, err.message);
      if (i === attempts.length - 1) {
        return res.status(500).json({ error: err.message, path });
      }
    }
  }
}
