// Cliente de TMDB (https://developer.themoviedb.org). Todas las llamadas pasan por aquí.
// Las fichas de película se guardan en MongoDB (colección movies) y se refrescan cada 7 días.
import { config } from './config.js';
import { Movie, TitleLookup, type IMovie, type Provider } from './models.js';

const IMG = 'https://image.tmdb.org/t/p';
const MOVIE_TTL_MS = 7 * 24 * 3600 * 1000;

export class TmdbError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TmdbError';
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** GET a la API de TMDB con reintentos si nos limitan (429) o falla la red. */
export async function tmdbGet<T>(path: string, params: Params = {}): Promise<T> {
  if (!config.tmdbToken) throw new TmdbError(500, 'Falta TMDB_TOKEN en la configuración del servidor');
  const url = new URL(config.tmdbUrl + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${config.tmdbToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (err) {
      if (attempt < 2) {
        await sleep(500 * (attempt + 1));
        continue;
      }
      throw new TmdbError(502, `No se pudo contactar con TMDB: ${(err as Error).message}`);
    }
    if (res.status === 429 && attempt < 4) {
      const wait = Number(res.headers.get('retry-after')) || 1;
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new TmdbError(res.status, `TMDB respondió ${res.status} en ${path}`);
    return (await res.json()) as T;
  }
}

export function posterUrl(path: string | null | undefined, size: 'w185' | 'w342' | 'w500' | 'w780' = 'w500') {
  return path ? `${IMG}/${size}${path}` : null;
}

/** Ejecuta tareas con un máximo de `limit` a la vez. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

// ------------------------------------------------------------ búsqueda

interface SearchResult {
  results: { id: number; title: string; original_title: string; release_date?: string; popularity: number }[];
}

export function normTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const yearOf = (d?: string) => (d && /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null);

/**
 * Busca en TMDB la película de Letterboxd (título original + año). Letterboxd usa los datos de
 * TMDB, así que casi siempre hay coincidencia exacta; si no, se admite un año de diferencia.
 */
export async function findMovieId(name: string, year: number | null): Promise<number | null> {
  const key = `${normTitle(name)}|${year ?? ''}`;
  const cached = await TitleLookup.findOne({ key }).lean();
  if (cached) return cached.tmdbId;

  const pick = (r: SearchResult['results']) => {
    if (!r.length) return null;
    const exact = r.filter((m) => normTitle(m.title) === normTitle(name) || normTitle(m.original_title) === normTitle(name));
    const pool = exact.length ? exact : r;
    if (year) {
      const sameYear = pool.find((m) => yearOf(m.release_date) === year);
      if (sameYear) return sameYear.id;
      const near = pool.find((m) => {
        const y = yearOf(m.release_date);
        return y !== null && Math.abs(y - year) <= 1;
      });
      if (near) return near.id;
      return exact.length ? exact[0].id : null;
    }
    return pool[0].id;
  };

  let id: number | null = null;
  if (year) {
    const r = await tmdbGet<SearchResult>('/search/movie', { query: name, year, include_adult: false });
    id = pick(r.results);
  }
  if (id === null) {
    const r = await tmdbGet<SearchResult>('/search/movie', { query: name, include_adult: false });
    id = pick(r.results);
  }
  await TitleLookup.updateOne({ key }, { $set: { tmdbId: id } }, { upsert: true });
  return id;
}

// ------------------------------------------------------------ fichas

interface TmdbProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority?: number;
}
interface MovieDetails {
  id: number;
  title: string;
  original_title: string;
  release_date?: string;
  runtime?: number | null;
  genres?: { id: number; name: string }[];
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  'watch/providers'?: {
    results?: Record<string, { link?: string; flatrate?: TmdbProvider[]; rent?: TmdbProvider[]; buy?: TmdbProvider[] }>;
  };
  videos?: { results?: { key: string; site: string; type: string; iso_639_1?: string; official?: boolean }[] };
  credits?: { cast?: { name: string; order: number }[]; crew?: { name: string; job: string }[] };
}

const toProvider = (p: TmdbProvider): Provider => ({
  id: p.provider_id,
  name: p.provider_name,
  logo: p.logo_path ? `${IMG}/w92${p.logo_path}` : null,
});

export function mapDetails(d: MovieDetails): IMovie {
  const reg = d['watch/providers']?.results?.[config.region] ?? {};
  const videos = (d.videos?.results ?? []).filter((v) => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const lang = config.language.slice(0, 2);
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.iso_639_1 === lang) ??
    videos.find((v) => v.type === 'Trailer' && v.official) ??
    videos.find((v) => v.type === 'Trailer') ??
    videos[0];
  return {
    tmdbId: d.id,
    title: d.title,
    originalTitle: d.original_title,
    year: yearOf(d.release_date),
    runtime: d.runtime || null,
    genres: d.genres ?? [],
    overview: d.overview ?? '',
    posterPath: d.poster_path ?? null,
    backdropPath: d.backdrop_path ?? null,
    voteAverage: d.vote_average ?? 0,
    voteCount: d.vote_count ?? 0,
    providers: {
      flatrate: (reg.flatrate ?? []).map(toProvider),
      rent: (reg.rent ?? []).map(toProvider),
      buy: (reg.buy ?? []).map(toProvider),
      link: reg.link ?? null,
    },
    trailerKey: trailer?.key ?? null,
    director: d.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
    cast: (d.credits?.cast ?? [])
      .sort((a, b) => a.order - b.order)
      .slice(0, 4)
      .map((c) => c.name),
    fetchedAt: new Date(),
  };
}

/** Ficha de una película (de la caché si es reciente). */
export async function getMovie(tmdbId: number): Promise<IMovie> {
  const cached = await Movie.findOne({ tmdbId }).lean<IMovie>();
  if (cached && Date.now() - new Date(cached.fetchedAt).getTime() < MOVIE_TTL_MS) return cached;
  const d = await tmdbGet<MovieDetails>(`/movie/${tmdbId}`, {
    language: config.language,
    append_to_response: 'watch/providers,videos,credits',
    include_video_language: `${config.language.slice(0, 2)},en`,
  });
  const movie = mapDetails(d);
  await Movie.updateOne({ tmdbId }, { $set: movie }, { upsert: true });
  return movie;
}

/** Varias fichas a la vez (las que fallen se omiten). */
export async function getMovies(ids: number[], limit = 8): Promise<IMovie[]> {
  const res = await mapLimit(ids, limit, async (id) => {
    try {
      return await getMovie(id);
    } catch (err) {
      console.warn(`[tmdb] ficha ${id}: ${(err as Error).message}`);
      return null;
    }
  });
  return res.filter((m): m is IMovie => !!m);
}

// ------------------------------------------------------------ listas

let genresCache: { at: number; list: { id: number; name: string }[] } | null = null;
export async function getGenres() {
  if (genresCache && Date.now() - genresCache.at < 24 * 3600 * 1000) return genresCache.list;
  const r = await tmdbGet<{ genres: { id: number; name: string }[] }>('/genre/movie/list', { language: config.language });
  genresCache = { at: Date.now(), list: r.genres };
  return r.genres;
}

let providersCache: { at: number; list: Provider[] } | null = null;
/** Plataformas de streaming del país, ordenadas por importancia. */
export async function getRegionProviders(): Promise<Provider[]> {
  if (providersCache && Date.now() - providersCache.at < 24 * 3600 * 1000) return providersCache.list;
  const r = await tmdbGet<{ results: (TmdbProvider & { display_priorities?: Record<string, number> })[] }>('/watch/providers/movie', {
    language: config.language,
    watch_region: config.region,
  });
  const list = r.results
    .map((p) => ({ p, prio: p.display_priorities?.[config.region] ?? p.display_priority ?? 999 }))
    .sort((a, b) => a.prio - b.prio)
    .map(({ p }) => toProvider(p));
  providersCache = { at: Date.now(), list };
  return list;
}

export interface DiscoverFilters {
  genres: number[];
  maxRuntime: number | null;
  minYear: number | null;
  maxYear: number | null;
  providers: number[] | null;
}

/** Películas populares que cumplen los filtros (TMDB filtra en el servidor). */
export async function discover(f: DiscoverFilters, page: number): Promise<number[]> {
  const r = await tmdbGet<{ results: { id: number }[] }>('/discover/movie', {
    language: config.language,
    region: config.region,
    sort_by: 'popularity.desc',
    include_adult: false,
    'vote_count.gte': 150,
    with_genres: f.genres.length ? f.genres.join('|') : undefined,
    'with_runtime.lte': f.maxRuntime ?? undefined,
    'primary_release_date.gte': f.minYear ? `${f.minYear}-01-01` : undefined,
    'primary_release_date.lte': f.maxYear ? `${f.maxYear}-12-31` : undefined,
    with_watch_providers: f.providers?.length ? f.providers.join('|') : undefined,
    watch_region: f.providers?.length ? config.region : undefined,
    with_watch_monetization_types: f.providers?.length ? 'flatrate' : undefined,
    page,
  });
  return r.results.map((m) => m.id);
}

export async function recommendations(tmdbId: number): Promise<number[]> {
  const r = await tmdbGet<{ results: { id: number }[] }>(`/movie/${tmdbId}/recommendations`, { language: config.language, page: 1 });
  return r.results.map((m) => m.id);
}
