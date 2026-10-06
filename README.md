# Cinefind: Movie Search

A responsive movie search website built with HTML, CSS, JavaScript and Tailwind CSS, using the free TMDB API.

## Features
- Search movies by title (results update as you type)
- Posters, ratings, release dates and genres on every card
- Details window with overview, runtime, director, cast, budget, revenue and trailer link
- Trending movies shown before you search
- Loading skeletons, empty-result message and error messages with a retry button
- Mobile-first layout, keyboard friendly, respects reduced-motion settings

## Run it on your computer
1. Install Node.js 18 or newer.
2. Open a terminal in this folder and run:
   ```
   npm start
   ```
3. Visit http://localhost:3000

Your credentials are already in `.env`. The site cannot read `.env` in the browser, so a small
proxy (`api/tmdb.js`) adds the token on the server. This keeps your key out of the front-end code.
Do not open `index.html` by double-clicking it, because the proxy would not be running.

## Deploy to Vercel
1. Upload the folder to GitHub (the `.gitignore` keeps `.env` out) or use the Vercel CLI.
2. In Vercel, open Project Settings, then Environment Variables, and add:
   - `TMDB_READ_TOKEN` = your read access token
   - `TMDB_API_KEY` = your API key (optional if the token is set)
3. Deploy. No build command is needed.

## Folder structure
```
index.html        page markup
css/style.css     custom styles
js/app.js         search, rendering and details window
api/tmdb.js       secure TMDB proxy (Vercel function)
server.js         local dev server that reads .env
.env              your TMDB credentials
```

Movie data and images come from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.
