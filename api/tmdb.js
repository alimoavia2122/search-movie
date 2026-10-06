/**
 * TMDB proxy (Vercel serverless function, also used by server.js locally).
 *
 * The browser calls /api/tmdb?path=search/movie&query=... and this function
 * adds your credentials from environment variables, so the token is never
 * exposed in the front-end code.
 */

const ALLOWED_PATHS = [
  /^search\/movie$/,
  /^trending\/movie\/(day|week)$/,
  /^movie\/popular$/,
  /^movie\/\d+$/,
  /^genre\/movie\/list$/
];

const ALLOWED_PARAMS = ['query', 'page', 'language', 'include_adult', 'append_to_response'];

module.exports = async function handler(req, res) {
  const token = process.env.TMDB_READ_TOKEN;
  const apiKey = process.env.TMDB_API_KEY;

  if (!token && !apiKey) {
    return res.status(500).json({
      status_message: 'TMDB credentials are missing. Add TMDB_READ_TOKEN to your .env file (or to your Vercel environment variables).'
    });
  }

  const query = req.query || {};
  const path = String(query.path || '').replace(/^\/+|\/+$/g, '');

  if (!ALLOWED_PATHS.some((rule) => rule.test(path))) {
    return res.status(400).json({ status_message: 'This endpoint is not allowed.' });
  }

  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  for (const key of ALLOWED_PARAMS) {
    if (query[key] !== undefined) {
      const value = Array.isArray(query[key]) ? query[key][0] : query[key];
      url.searchParams.set(key, String(value));
    }
  }

  const headers = { accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set('api_key', apiKey);

  try {
    const response = await fetch(url, { headers });
    const data = await response.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ status_message: 'Could not reach the TMDB service. Please try again.' });
  }
};
