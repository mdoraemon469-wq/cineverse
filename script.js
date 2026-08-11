// ============================================================
//  🌐 আপনার Cloudflare Worker URL এখানে বসান
// ============================================================
const WORKER_URL = 'https://sparkling-bird-4f19.mdoraemon469.workers.dev';

const IMG_BASE = 'https://image.tmdb.org/t/p/w500';
const FALLBACK_POSTER = 'https://via.placeholder.com/500x750/1a1a2e/6c3bf1?text=No+Poster';

// ============================================================
//  STATE
// ============================================================
let allMoviesCache = {};
let genreMap = [];

// ============================================================
//  DOM REFS
// ============================================================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const navbar = $('#navbar');
const searchInput = $('#searchInput');
const heroPoster = $('#heroPoster');

const trendingGrid = $('#trendingGrid');
const popularGrid = $('#popularGrid');
const topRatedGrid = $('#topRatedGrid');
const upcomingGrid = $('#upcomingGrid');

const modalOverlay = $('#modalOverlay');
const modalClose = $('#modalClose');
const modalPoster = $('#modalPoster');
const modalTitle = $('#modalTitle');
const modalTagline = $('#modalTagline');
const modalYear = $('#modalYear');
const modalRuntime = $('#modalRuntime');
const modalLanguage = $('#modalLanguage');
const modalScore = $('#modalScore');
const modalStars = $('#modalStars');
const modalVotes = $('#modalVotes');
const modalOverview = $('#modalOverview');
const modalGenres = $('#modalGenres');

const scrollTopBtn = $('#scrollTop');

// ============================================================
//  HELPERS
// ============================================================
function formatRating(voteAverage) {
    return voteAverage ? voteAverage.toFixed(1) : '0.0';
}
function starsFromRating(voteAverage) {
    const full = Math.round(voteAverage / 2);
    return '★'.repeat(full) + '☆'.repeat(5 - full);
}
function yearFromDate(dateStr) {
    if (!dateStr) return '----';
    return dateStr.slice(0, 4);
}
function languageName(code) {
    const map = { en: 'English', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian',
        ja: 'Japanese', ko: 'Korean', zh: 'Chinese', ru: 'Russian', pt: 'Portuguese', hi: 'Hindi' };
    return map[code] || code.toUpperCase();
}
function getGenreNames(genreIds, allGenres) {
    if (!allGenres || !genreIds) return [];
    return genreIds.map(id => {
        const g = allGenres.find(g => g.id === id);
        return g ? g.name : null;
    }).filter(Boolean);
}

// ============================================================
//  API (Worker Proxy দিয়ে রিকোয়েস্ট পাঠানো হবে)
// ============================================================
async function fetchGenres() {
    try {
        const res = await fetch(`${WORKER_URL}/api/tmdb/genre/movie/list?language=en-US`);
        const data = await res.json();
        genreMap = data.genres || [];
    } catch (_) {
        genreMap = [];
    }
}

async function fetchMovies(endpoint) {
    try {
        const res = await fetch(
            `${WORKER_URL}/api/tmdb${endpoint}?language=en-US&page=1`
        );
        const data = await res.json();
        return data.results || [];
    } catch (_) {
        return [];
    }
}

async function fetchMovieDetails(movieId) {
    try {
        const res = await fetch(
            `${WORKER_URL}/api/tmdb/movie/${movieId}?language=en-US&append_to_response=credits`
        );
        return await res.json();
    } catch (_) {
        return null;
    }
}

async function searchMovies(query) {
    try {
        const res = await fetch(
            `${WORKER_URL}/api/tmdb/search/movie?language=en-US&query=${encodeURIComponent(query)}&page=1`
        );
        const data = await res.json();
        return data.results || [];
    } catch (_) {
        return [];
    }
}

// ============================================================
//  RENDER
// ============================================================
function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.dataset.id = movie.id;

    const posterUrl = movie.poster_path ? `${IMG_BASE}${movie.poster_path}` : FALLBACK_POSTER;
    const title = movie.title || 'Untitled';
    const rating = formatRating(movie.vote_average);
    const year = yearFromDate(movie.release_date);

    card.innerHTML = `
        <img class="poster" src="${posterUrl}" alt="${title}" loading="lazy" onerror="this.src='${FALLBACK_POSTER}'" />
        <div class="badge">${rating}</div>
        <div class="card-body">
            <h3>${title}</h3>
            <div class="meta">
                <span>${year}</span>
                <span class="rating"><i class="fas fa-star"></i> ${rating}</span>
            </div>
        </div>
    `;

    card.addEventListener('click', () => openModal(movie.id));
    return card;
}

function renderMovies(grid, movies) {
    grid.innerHTML = '';
    if (!movies || movies.length === 0) {
        grid.innerHTML = `<p class="error-msg">No movies found.</p>`;
        return;
    }
    const fragment = document.createDocumentFragment();
    movies.slice(0, 12).forEach(m => {
        fragment.appendChild(createMovieCard(m));
    });
    grid.appendChild(fragment);
}

function renderSkeletons(grid, count = 8) {
    grid.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const sk = document.createElement('div');
        sk.className = 'skeleton';
        grid.appendChild(sk);
    }
}

// ============================================================
//  LOAD SECTIONS
// ============================================================
async function loadSection(grid, endpoint, cacheKey) {
    if (allMoviesCache[cacheKey]) {
        renderMovies(grid, allMoviesCache[cacheKey]);
        return;
    }
    renderSkeletons(grid);
    const movies = await fetchMovies(endpoint);
    allMoviesCache[cacheKey] = movies;
    renderMovies(grid, movies);
}

async function loadAllSections() {
    await fetchGenres();
    await Promise.all([
        loadSection(trendingGrid, '/trending/movie/day', 'trending'),
        loadSection(popularGrid, '/movie/popular', 'popular'),
        loadSection(topRatedGrid, '/movie/top_rated', 'topRated'),
        loadSection(upcomingGrid, '/movie/upcoming', 'upcoming'),
    ]);
    if (allMoviesCache.trending && allMoviesCache.trending.length > 0) {
        const first = allMoviesCache.trending[0];
        if (first.poster_path) {
            heroPoster.src = `${IMG_BASE}${first.poster_path}`;
            heroPoster.alt = first.title;
        }
    }
}

// ============================================================
//  SEARCH
// ============================================================
let searchTimeout = null;

async function handleSearch(query) {
    const trimmed = query.trim();
    if (!trimmed) {
        renderMovies(trendingGrid, allMoviesCache.trending || []);
        renderMovies(popularGrid, allMoviesCache.popular || []);
        renderMovies(topRatedGrid, allMoviesCache.topRated || []);
        renderMovies(upcomingGrid, allMoviesCache.upcoming || []);
        return;
    }
    [trendingGrid, popularGrid, topRatedGrid, upcomingGrid].forEach(g => {
        g.innerHTML = `<div class="spinner"><i class="fas fa-spinner"></i> Searching...</div>`;
    });
    const results = await searchMovies(trimmed);
    renderMovies(trendingGrid, results);
    renderMovies(popularGrid, results);
    renderMovies(topRatedGrid, results);
    renderMovies(upcomingGrid, results);
}

searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => handleSearch(e.target.value), 400);
});

// ============================================================
//  MODAL
// ============================================================
async function openModal(movieId) {
    modalOverlay.classList.add('active');
    document.body.style.overflow = 'hidden';

    modalTitle.textContent = 'Loading...';
    modalOverview.textContent = 'Fetching details...';
    modalPoster.src = FALLBACK_POSTER;
    modalGenres.innerHTML = '';
    modalTagline.textContent = '';
    modalYear.textContent = '----';
    modalRuntime.textContent = '-- min';
    modalLanguage.textContent = '--';
    modalScore.textContent = '0.0';
    modalStars.textContent = '☆☆☆☆☆';
    modalVotes.textContent = '0';

    const details = await fetchMovieDetails(movieId);
    if (!details) {
        modalTitle.textContent = 'Error loading movie';
        modalOverview.textContent = 'Could not fetch movie details. Please try again.';
        return;
    }

    const poster = details.poster_path ? `${IMG_BASE}${details.poster_path}` : FALLBACK_POSTER;
    modalPoster.src = poster;
    modalPoster.alt = details.title;
    modalTitle.textContent = details.title || 'Untitled';
    modalTagline.textContent = details.tagline || '';
    modalYear.textContent = yearFromDate(details.release_date);
    modalRuntime.textContent = details.runtime ? `${details.runtime} min` : '-- min';
    modalLanguage.textContent = languageName(details.original_language);
    const rating = details.vote_average || 0;
    modalScore.textContent = formatRating(rating);
    modalStars.textContent = starsFromRating(rating);
    modalVotes.textContent = details.vote_count || 0;
    modalOverview.textContent = details.overview || 'No overview available.';

    const genreList = details.genres || [];
    modalGenres.innerHTML = genreList.map(g =>
        `<span>${g.name}</span>`
    ).join('');
}

function closeModal() {
    modalOverlay.classList.remove('active');
    document.body.style.overflow = '';
}

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// ============================================================
//  SCROLL TO TOP
// ============================================================
window.addEventListener('scroll', () => {
    if (window.scrollY > 400) {
        scrollTopBtn.classList.add('visible');
    } else {
        scrollTopBtn.classList.remove('visible');
    }
    if (window.scrollY > 20) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

scrollTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ============================================================
//  THEME TOGGLE
// ============================================================
const themeToggle = $('#themeToggle');
let darkMode = true;

themeToggle.addEventListener('click', () => {
    darkMode = !darkMode;
    const root = document.documentElement;
    if (darkMode) {
        root.style.setProperty('--bg-primary', '#0a0a0f');
        root.style.setProperty('--bg-secondary', '#12121a');
        root.style.setProperty('--bg-card', '#1a1a2e');
        root.style.setProperty('--bg-card-hover', '#24243a');
        root.style.setProperty('--text-primary', '#ffffff');
        root.style.setProperty('--text-secondary', '#a0a0b8');
        root.style.setProperty('--text-muted', '#6a6a82');
        root.style.setProperty('--border-color', '#2a2a42');
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
    } else {
        root.style.setProperty('--bg-primary', '#f4f4f9');
        root.style.setProperty('--bg-secondary', '#ffffff');
        root.style.setProperty('--bg-card', '#ffffff');
        root.style.setProperty('--bg-card-hover', '#f0f0f5');
        root.style.setProperty('--text-primary', '#111111');
        root.style.setProperty('--text-secondary', '#444466');
        root.style.setProperty('--text-muted', '#8888aa');
        root.style.setProperty('--border-color', '#d0d0dd');
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
    }
});

// ============================================================
//  INIT
// ============================================================
loadAllSections();
console.log('🎬 CineVerse — Movie Hub loaded successfully!');

// ============================================================
//  SERVICE WORKER REGISTRATION (যোগ করা হলো)
// ============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/cineverse/sw.js')
        .then(() => {
            console.log('✅ Service Worker registered successfully!');
        })
        .catch((err) => {
            console.log('❌ Service Worker registration failed:', err);
        });
}