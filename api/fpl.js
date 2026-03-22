export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { path } = req.query;
  if (!path) return res.status(400).json({ error: 'No path provided' });

  const url = `https://fantasy.premierleague.com/api/${path}`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://fantasy.premierleague.com/',
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `FPL API returned ${response.status}` });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
