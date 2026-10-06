/**
 * Local development server (no npm packages needed, Node 18+).
 * Reads .env, serves the site and runs the same /api/tmdb proxy used on Vercel.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

// ---- Load .env ----
try {
  const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && !(m[1] in process.env)) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch (err) {
  console.warn('No .env file found. Copy .env.example to .env and add your TMDB credentials.');
}

const tmdbHandler = require('./api/tmdb.js');
const PORT = process.env.PORT || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

// Only these locations are public. .env and server.js are never served.
const PUBLIC_FILES = new Set(['/index.html']);
const PUBLIC_DIRS = ['/css/', '/js/', '/assets/'];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Small shim so the Vercel-style handler works here too
  if (url.pathname === '/api/tmdb') {
    req.query = Object.fromEntries(url.searchParams);
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(body));
    };
    return tmdbHandler(req, res);
  }

  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const isPublic = PUBLIC_FILES.has(pathname) || PUBLIC_DIRS.some((d) => pathname.startsWith(d));
  const filePath = path.join(__dirname, pathname);

  if (!isPublic || !filePath.startsWith(__dirname)) {
    res.statusCode = 404;
    return res.end('Not found');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(filePath)] || 'application/octet-stream');
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`Cinefind is running at http://localhost:${PORT}`);
});
