// TMDB y Letterboxd de mentira para los tests (el entorno de pruebas no tiene internet).
import type { AddressInfo } from 'node:net';
import express from 'express';

export interface FakeMovie {
  id: number;
  title: string;
  year: number;
  runtime: number;
  genres: number[];
  providers: number[];
  popularity: number;
}

const GENRES = [
  { id: 28, name: 'Acción' },
  { id: 35, name: 'Comedia' },
  { id: 18, name: 'Drama' },
  { id: 27, name: 'Terror' },
  { id: 10749, name: 'Romance' },
];
const PROVIDERS = [
  { provider_id: 8, provider_name: 'Netflix', logo_path: '/netflix.png', display_priorities: { ES: 1 } },
  { provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/prime.png', display_priorities: { ES: 2 } },
  { provider_id: 337, provider_name: 'Disney Plus', logo_path: '/disney.png', display_priorities: { ES: 3 } },
];

export function makeCatalog(): FakeMovie[] {
  const out: FakeMovie[] = [];
  for (let i = 1; i <= 60; i++) {
    out.push({
      id: i,
      title: `Película ${i}`,
      year: 1980 + (i % 45),
      runtime: 80 + ((i * 7) % 90),
      genres: [GENRES[i % GENRES.length].id, ...(i % 3 === 0 ? [18] : [])],
      providers: i % 4 === 0 ? [8] : i % 4 === 1 ? [119] : i % 4 === 2 ? [8, 337] : [],
      popularity: 1000 - i,
    });
  }
  return out;
}

export function startFakeTmdb(catalog = makeCatalog(), rss: Record<string, string> = {}) {
  const app = express();
  let calls = 0;
  app.use((req, res, next) => {
    calls++;
    if (!req.path.startsWith('/lb/') && req.headers.authorization !== 'Bearer test-token') {
      res.status(401).json({ status_message: 'Invalid API key' });
      return;
    }
    next();
  });
  const byId = new Map(catalog.map((m) => [m.id, m]));
  const brief = (m: FakeMovie) => ({
    id: m.id,
    title: m.title,
    original_title: m.title,
    release_date: `${m.year}-05-01`,
    popularity: m.popularity,
  });

  app.get('/search/movie', (req, res) => {
    const q = String(req.query.query ?? '').toLowerCase();
    const year = req.query.year ? Number(req.query.year) : null;
    const results = catalog.filter((m) => m.title.toLowerCase() === q && (!year || m.year === year)).map(brief);
    res.json({ results });
  });
  app.get('/movie/:id/recommendations', (req, res) => {
    const id = Number(req.params.id);
    res.json({ results: catalog.filter((m) => m.id !== id && Math.abs(m.id - id) <= 6).map(brief) });
  });
  app.get('/movie/:id', (req, res) => {
    const m = byId.get(Number(req.params.id));
    if (!m) {
      res.status(404).json({ status_message: 'not found' });
      return;
    }
    const prov = PROVIDERS.filter((p) => m.providers.includes(p.provider_id));
    res.json({
      ...brief(m),
      runtime: m.runtime,
      genres: GENRES.filter((g) => m.genres.includes(g.id)),
      overview: `Sinopsis de ${m.title}.`,
      poster_path: `/p${m.id}.jpg`,
      backdrop_path: `/b${m.id}.jpg`,
      vote_average: 6 + (m.id % 4),
      vote_count: 500,
      'watch/providers': { results: { ES: { link: `https://www.themoviedb.org/movie/${m.id}/watch?locale=ES`, flatrate: prov } } },
      videos: { results: [{ key: `yt${m.id}`, site: 'YouTube', type: 'Trailer', iso_639_1: 'es', official: true }] },
      credits: { cast: [{ name: 'Actriz Uno', order: 0 }], crew: [{ name: 'Directora', job: 'Director' }] },
    });
  });
  app.get('/discover/movie', (req, res) => {
    const genres = req.query.with_genres ? String(req.query.with_genres).split('|').map(Number) : [];
    const provs = req.query.with_watch_providers ? String(req.query.with_watch_providers).split('|').map(Number) : [];
    const maxRt = req.query['with_runtime.lte'] ? Number(req.query['with_runtime.lte']) : null;
    const page = Number(req.query.page ?? 1);
    const list = catalog
      .filter((m) => !genres.length || m.genres.some((g) => genres.includes(g)))
      .filter((m) => !provs.length || m.providers.some((p) => provs.includes(p)))
      .filter((m) => !maxRt || m.runtime <= maxRt)
      .sort((a, b) => b.popularity - a.popularity);
    res.json({ page, results: list.slice((page - 1) * 20, page * 20).map(brief) });
  });
  app.get('/genre/movie/list', (_req, res) => {
    res.json({ genres: GENRES });
  });
  app.get('/watch/providers/movie', (_req, res) => {
    res.json({ results: PROVIDERS });
  });
  // Letterboxd: /lb/<usuario>/rss/
  app.get('/lb/:user/rss/', (req, res) => {
    const body = rss[req.params.user];
    if (!body) {
      res.status(404).send('not found');
      return;
    }
    res.type('application/rss+xml').send(body);
  });

  const server = app.listen(Number(process.env.FAKE_TMDB_PORT ?? 0));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => server.close(),
    calls: () => calls,
  };
}

export function rssFor(items: { id: number; title: string; year: number; rating?: number }[]): string {
  return `<?xml version='1.0' encoding='utf-8'?>
<rss version="2.0" xmlns:letterboxd="https://letterboxd.com" xmlns:tmdb="https://themoviedb.org"><channel>
${items
  .map(
    (i) => `<item><title>${i.title}, ${i.year}</title>
<letterboxd:watchedDate>2026-09-20</letterboxd:watchedDate>
<letterboxd:filmTitle>${i.title}</letterboxd:filmTitle><letterboxd:filmYear>${i.year}</letterboxd:filmYear>
${i.rating ? `<letterboxd:memberRating>${i.rating}</letterboxd:memberRating>` : ''}
<tmdb:movieId>${i.id}</tmdb:movieId></item>`,
  )
  .join('\n')}
<item><title>Una lista</title><link>https://letterboxd.com/x/list/y/</link></item>
</channel></rss>`;
}
