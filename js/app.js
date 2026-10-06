(() => {
  'use strict';

  const IMG = 'https://image.tmdb.org/t/p/';
  const $ = (sel, root = document) => root.querySelector(sel);

  const el = {
    form: $('#search-form'),
    input: $('#search-input'),
    clear: $('#clear-btn'),
    hero: $('#hero'),
    heading: $('#results-heading'),
    count: $('#results-count'),
    status: $('#status'),
    grid: $('#results'),
    more: $('#load-more'),
    dialog: $('#movie-dialog'),
    dialogBody: $('#dialog-body'),
    dialogClose: $('#dialog-close')
  };

  const state = {
    query: '',
    page: 1,
    totalPages: 1,
    totalResults: 0,
    loading: false,
    requestId: 0,
    genres: {},
    dialogToken: 0
  };

  /* ---------- Helpers ---------- */

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

  const icons = {
    star: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z"/></svg>',
    film: '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8.5 11h5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/></svg>'
  };

  const noPosterHTML = () =>
    `<div class="no-poster">${icons.film}<span>No poster available</span></div>`;

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
  };

  const formatRuntime = (mins) => {
    if (!mins) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h ? `${h}h ${m}m` : `${m}m`;
  };

  const formatMoney = (n) =>
    n ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n) : '';

  const ratingText = (m) => (m.vote_count > 0 ? Number(m.vote_average).toFixed(1) : 'NR');

  /* ---------- API ---------- */

  async function api(path, params = {}) {
    const qs = new URLSearchParams({ path, language: 'en-US', ...params });
    let res;
    try {
      res = await fetch(`/api/tmdb?${qs.toString()}`);
    } catch (err) {
      throw new Error(
        location.protocol === 'file:'
          ? 'Open this site with the local server (run "npm start"), not by double-clicking index.html.'
          : 'Could not reach the server. Check your internet connection and try again.'
      );
    }
    let data = null;
    try { data = await res.json(); } catch (err) { /* non-JSON response */ }
    if (!res.ok) {
      throw new Error((data && data.status_message) || `The request failed (error ${res.status}). Please try again.`);
    }
    return data;
  }

  async function loadGenres() {
    try {
      const data = await api('genre/movie/list');
      (data.genres || []).forEach((g) => { state.genres[g.id] = g.name; });
    } catch (err) {
      /* Genres are optional on cards; details still show them. */
    }
  }

  /* ---------- Results grid ---------- */

  function cardHTML(m) {
    const year = m.release_date ? m.release_date.slice(0, 4) : 'Release date TBA';
    const genres = (m.genre_ids || []).map((id) => state.genres[id]).filter(Boolean).slice(0, 2).join(', ');
    const poster = m.poster_path
      ? `<img class="poster" src="${IMG}w342${m.poster_path}"
              srcset="${IMG}w185${m.poster_path} 185w, ${IMG}w342${m.poster_path} 342w, ${IMG}w500${m.poster_path} 500w"
              sizes="(min-width: 1024px) 200px, (min-width: 640px) 30vw, 46vw"
              alt="" loading="lazy" width="342" height="513">`
      : noPosterHTML();

    return `
      <li>
        <button type="button" class="card" data-id="${m.id}" aria-label="${esc(m.title)}, ${esc(year)}. Open details">
          <div class="frame">
            ${poster}
            <span class="badge" title="TMDB user rating">${icons.star}${ratingText(m)}</span>
          </div>
          <div class="info">
            <div class="title">${esc(m.title)}</div>
            <div class="meta">
              <span>${esc(year)}</span>
              ${genres ? `<span class="genres">${esc(genres)}</span>` : ''}
            </div>
          </div>
        </button>
      </li>`;
  }

  function skeletonHTML(count = 10) {
    return Array.from({ length: count }, () => `
      <li class="skeleton" aria-hidden="true">
        <div class="card" style="cursor:default">
          <div class="frame"></div>
          <div class="info">
            <div class="line" style="width:85%"></div>
            <div class="line" style="width:45%;margin-top:0.55rem"></div>
          </div>
        </div>
      </li>`).join('');
  }

  function showStatus({ type = 'info', title, text, action, onAction }) {
    el.status.hidden = false;
    el.status.innerHTML = `
      <div class="status-box ${type === 'error' ? 'is-error' : ''}" role="${type === 'error' ? 'alert' : 'status'}">
        <span class="icon">${type === 'error' ? icons.alert : icons.search}</span>
        <h3>${esc(title)}</h3>
        <p>${esc(text)}</p>
        ${action ? `<button type="button" class="action-btn primary" id="status-action" style="margin-top:0.75rem">${esc(action)}</button>` : ''}
      </div>`;
    if (action && onAction) $('#status-action').addEventListener('click', onAction);
  }

  function hideStatus() {
    el.status.hidden = true;
    el.status.innerHTML = '';
  }

  function updateHeading() {
    if (state.query) {
      el.heading.textContent = `Results for “${state.query}”`;
      el.count.textContent = state.totalResults
        ? `${state.totalResults.toLocaleString('en-US')} ${state.totalResults === 1 ? 'movie' : 'movies'} found`
        : '';
    } else {
      el.heading.textContent = 'Trending this week';
      el.count.textContent = '';
    }
  }

  function setHeroBackdrop(results) {
    const pick = results.find((m) => m.backdrop_path);
    if (!pick) return;
    el.hero.style.setProperty('--hero-img', `url("${IMG}w1280${pick.backdrop_path}")`);
    el.hero.classList.add('has-bg');
  }

  async function fetchMovies({ reset }) {
    if (state.loading && !reset) return;

    const requestId = ++state.requestId;
    state.loading = true;

    if (reset) {
      state.page = 1;
      hideStatus();
      el.more.hidden = true;
      el.grid.innerHTML = skeletonHTML();
      el.grid.setAttribute('aria-busy', 'true');
      el.count.textContent = '';
    } else {
      state.page += 1;
      hideStatus();
      el.more.disabled = true;
      el.more.textContent = 'Loading…';
    }

    try {
      const data = state.query
        ? await api('search/movie', { query: state.query, page: state.page, include_adult: 'false' })
        : await api('trending/movie/week', { page: state.page });

      if (requestId !== state.requestId) return; // a newer search replaced this one

      const results = data.results || [];
      state.totalPages = Math.min(data.total_pages || 1, 500);
      state.totalResults = data.total_results || 0;

      if (reset) {
        el.grid.innerHTML = results.map(cardHTML).join('');
        if (!state.query) setHeroBackdrop(results);
      } else {
        el.grid.insertAdjacentHTML('beforeend', results.map(cardHTML).join(''));
      }

      updateHeading();

      if (reset && results.length === 0) {
        showStatus({
          title: `No movies found for “${state.query}”`,
          text: 'Check the spelling or try a shorter title.'
        });
      }
      el.more.hidden = state.page >= state.totalPages || results.length === 0;
    } catch (err) {
      if (requestId !== state.requestId) return;
      if (reset) {
        el.grid.innerHTML = '';
      } else {
        state.page -= 1;
        el.more.hidden = false;
      }
      showStatus({
        type: 'error',
        title: 'Something went wrong',
        text: err.message,
        action: 'Try again',
        onAction: () => fetchMovies({ reset })
      });
    } finally {
      if (requestId === state.requestId) {
        state.loading = false;
        el.grid.removeAttribute('aria-busy');
        el.more.disabled = false;
        el.more.textContent = 'Show more movies';
      }
    }
  }

  /* ---------- Search ---------- */

  function setQuery(value, { force = false } = {}) {
    const q = value.trim();
    if (q === state.query && !force) return;
    state.query = q;

    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q);
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);

    fetchMovies({ reset: true });
  }

  let debounceTimer;
  el.input.addEventListener('input', () => {
    el.clear.hidden = !el.input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => setQuery(el.input.value), 500);
  });

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(debounceTimer);
    setQuery(el.input.value, { force: true });
    el.input.blur(); // closes the on-screen keyboard on phones
  });

  el.clear.addEventListener('click', () => {
    clearTimeout(debounceTimer);
    el.input.value = '';
    el.clear.hidden = true;
    el.input.focus();
    setQuery('');
  });

  el.more.addEventListener('click', () => fetchMovies({ reset: false }));

  /* ---------- Details dialog ---------- */

  function dialogSkeletonHTML() {
    return `
      <div aria-hidden="true">
        <div class="skel" style="height:12rem;border-radius:0"></div>
        <div class="flex flex-col gap-6 p-5 sm:flex-row sm:p-8">
          <div class="skel w-36 shrink-0 sm:w-48" style="aspect-ratio:2/3"></div>
          <div class="flex-1">
            <div class="skel" style="height:2rem;width:70%"></div>
            <div class="skel" style="height:1rem;width:40%;margin-top:1rem"></div>
            <div class="skel" style="height:1rem;width:100%;margin-top:1.5rem"></div>
            <div class="skel" style="height:1rem;width:92%;margin-top:0.6rem"></div>
            <div class="skel" style="height:1rem;width:80%;margin-top:0.6rem"></div>
          </div>
        </div>
      </div>
      <h2 id="dialog-title" class="sr-only">Loading movie details</h2>`;
  }

  function detailHTML(m) {
    const year = m.release_date ? m.release_date.slice(0, 4) : '';
    const hasRating = m.vote_count > 0;
    const runtime = formatRuntime(m.runtime);
    const genres = (m.genres || []).map((g) => `<span class="chip">${esc(g.name)}</span>`).join('');
    const cast = ((m.credits && m.credits.cast) || []).slice(0, 8);
    const directors = ((m.credits && m.credits.crew) || [])
      .filter((c) => c.job === 'Director').map((c) => c.name).slice(0, 2).join(', ');
    const videos = (m.videos && m.videos.results) || [];
    const trailer =
      videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official) ||
      videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer') ||
      videos.find((v) => v.site === 'YouTube');
    const language = (m.spoken_languages && m.spoken_languages[0] && m.spoken_languages[0].english_name) ||
      (m.original_language || '').toUpperCase();

    const facts = [
      ['Release date', formatDate(m.release_date)],
      ['Runtime', runtime],
      ['Director', directors],
      ['Language', language],
      ['Status', m.status],
      ['Budget', formatMoney(m.budget)],
      ['Revenue', formatMoney(m.revenue)]
    ].filter(([, v]) => v);

    const poster = m.poster_path
      ? `<img class="poster h-full w-full object-cover" src="${IMG}w500${m.poster_path}" alt="Poster for ${esc(m.title)}" width="500" height="750">`
      : noPosterHTML();

    const backdrop = m.backdrop_path
      ? `style="background-image:url('${IMG}w780${m.backdrop_path}')"`
      : '';

    const castHTML = cast.map((p) => {
      const initials = p.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
      const avatar = p.profile_path
        ? `<img class="avatar" src="${IMG}w185${p.profile_path}" alt="" loading="lazy" width="40" height="40">`
        : `<span class="avatar-fallback" aria-hidden="true">${esc(initials)}</span>`;
      return `
        <li class="flex items-center gap-3">
          ${avatar}
          <div class="min-w-0">
            <p class="truncate text-sm font-bold">${esc(p.name)}</p>
            <p class="truncate text-sm text-mute">${esc(p.character || '')}</p>
          </div>
        </li>`;
    }).join('');

    return `
      <div class="backdrop-img" ${backdrop}>
        <div class="backdrop-fade h-full w-full"></div>
      </div>

      <div class="flex flex-col gap-6 px-5 pb-8 sm:flex-row sm:gap-8 sm:px-8">
        <div class="relative -mt-16 w-36 shrink-0 sm:-mt-24 sm:w-52">
          <div class="aspect-[2/3] overflow-hidden rounded-xl border border-line bg-raised shadow-xl">${poster}</div>
        </div>

        <div class="min-w-0 flex-1 sm:pt-4">
          <h2 id="dialog-title" class="font-display text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            ${esc(m.title)}${year ? ` <span class="font-sans text-xl font-normal text-mute sm:text-2xl">(${esc(year)})</span>` : ''}
          </h2>
          ${m.tagline ? `<p class="mt-2 font-display text-lg italic text-mute">${esc(m.tagline)}</p>` : ''}

          <div class="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
            <p class="flex items-center gap-1.5 text-gold">
              ${icons.star.replace('width="13" height="13"', 'width="20" height="20"')}
              <span class="text-lg font-bold">${hasRating ? Number(m.vote_average).toFixed(1) : 'Not rated'}</span>
              ${hasRating ? `<span class="text-sm text-mute">out of 10 from ${Number(m.vote_count).toLocaleString('en-US')} votes</span>` : ''}
            </p>
            ${runtime ? `<p class="text-sm text-mute">${esc(runtime)}</p>` : ''}
          </div>

          ${genres ? `<div class="mt-4 flex flex-wrap gap-2">${genres}</div>` : ''}

          <h3 class="mt-6 font-display text-xl font-semibold">Overview</h3>
          <p class="mt-2 max-w-prose leading-relaxed text-fg/90">${esc(m.overview || 'No description is available for this movie yet.')}</p>

          <div class="mt-6 flex flex-wrap gap-3">
            ${trailer ? `<a class="action-btn primary" href="https://www.youtube.com/watch?v=${encodeURIComponent(trailer.key)}" target="_blank" rel="noopener noreferrer">Watch trailer</a>` : ''}
            <a class="action-btn" href="https://www.themoviedb.org/movie/${m.id}" target="_blank" rel="noopener noreferrer">View on TMDB</a>
          </div>
        </div>
      </div>

      <div class="border-t border-line px-5 py-6 sm:px-8">
        <h3 class="font-display text-xl font-semibold">Details</h3>
        <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
          ${facts.map(([k, v]) => `
            <div>
              <dt class="text-sm text-mute">${esc(k)}</dt>
              <dd class="mt-0.5 font-bold">${esc(v)}</dd>
            </div>`).join('')}
        </dl>

        ${cast.length ? `
          <h3 class="mt-8 font-display text-xl font-semibold">Top cast</h3>
          <ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">${castHTML}</ul>` : ''}
      </div>`;
  }

  async function openMovie(id) {
    const token = ++state.dialogToken;
    el.dialogBody.innerHTML = dialogSkeletonHTML();
    if (!el.dialog.open) {
      el.dialog.showModal();
      document.body.classList.add('modal-open');
    }
    el.dialog.scrollTop = 0;

    try {
      const movie = await api(`movie/${id}`, { append_to_response: 'credits,videos' });
      if (token !== state.dialogToken) return;
      el.dialogBody.innerHTML = detailHTML(movie);
      el.dialog.scrollTop = 0;
    } catch (err) {
      if (token !== state.dialogToken) return;
      el.dialogBody.innerHTML = `
        <div class="status-box is-error" role="alert" style="margin:3rem auto">
          <span class="icon">${icons.alert}</span>
          <h2 id="dialog-title" class="font-display" style="font-size:1.35rem;font-weight:600">Could not load this movie</h2>
          <p>${esc(err.message)}</p>
          <button type="button" class="action-btn primary" id="dialog-retry" style="margin-top:0.75rem">Try again</button>
        </div>`;
      $('#dialog-retry').addEventListener('click', () => openMovie(id));
    }
  }

  el.grid.addEventListener('click', (e) => {
    const card = e.target.closest('.card[data-id]');
    if (card) openMovie(card.dataset.id);
  });

  el.dialogClose.addEventListener('click', () => el.dialog.close());

  // A click on the dimmed backdrop lands on the <dialog> element itself.
  el.dialog.addEventListener('click', (e) => {
    if (e.target === el.dialog) el.dialog.close();
  });

  el.dialog.addEventListener('close', () => {
    state.dialogToken += 1;
    document.body.classList.remove('modal-open');
    el.dialogBody.innerHTML = '';
  });

  // If a poster fails to load, swap in the placeholder.
  document.addEventListener('error', (e) => {
    const t = e.target;
    if (t && t.tagName === 'IMG' && t.classList.contains('poster')) {
      t.outerHTML = noPosterHTML();
    }
  }, true);

  /* ---------- Start ---------- */

  async function init() {
    const initial = new URLSearchParams(location.search).get('q') || '';
    el.input.value = initial;
    el.clear.hidden = !initial;
    state.query = initial.trim();
    el.grid.innerHTML = skeletonHTML();
    await loadGenres();
    fetchMovies({ reset: true });
  }

  init();
})();
