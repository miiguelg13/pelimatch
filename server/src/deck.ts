// Construye el mazo de una sesión: películas que ninguno de los dos ha visto, sacadas de
// vuestras watchlists, de recomendaciones basadas en lo que os ha gustado y de las populares,
// filtradas por género, duración, año y plataformas. Los dos deslizan el mismo mazo.
import type { Types } from 'mongoose';
import { Match, UserFilm, type DeckCard, type DeckSource, type IMovie, type SessionFilters } from './models.js';
import { discover, getMovies, recommendations, mapLimit } from './tmdb.js';

export const DECK_SIZE = 40;

export interface DeckContext {
  coupleId: Types.ObjectId;
  memberIds: Types.ObjectId[];
  /** Plataformas de la pareja (ids de TMDB). */
  providers: number[];
}

/** ¿Cumple los filtros una ficha concreta? */
export function passes(m: IMovie, f: SessionFilters, providers: number[]): boolean {
  if (f.genres.length && !m.genres.some((g) => f.genres.includes(g.id))) return false;
  if (f.maxRuntime && m.runtime && m.runtime > f.maxRuntime) return false;
  if (f.minYear && (!m.year || m.year < f.minYear)) return false;
  if (f.maxYear && (!m.year || m.year > f.maxYear)) return false;
  if (f.onlyMyProviders) {
    if (!providers.length) return false;
    if (!m.providers.flatrate.some((p) => providers.includes(p.id))) return false;
  }
  if (!m.posterPath) return false;
  return true;
}

/** Barajado determinista (mismo orden cada vez para la misma semilla). */
export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = [...arr];
  let s = seed >>> 0 || 1;
  const rnd = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function buildDeck(ctx: DeckContext, f: SessionFilters, seed = Date.now()): Promise<DeckCard[]> {
  const [films, matches] = await Promise.all([
    UserFilm.find({ userId: { $in: ctx.memberIds } })
      .select('userId tmdbId kind rating date')
      .lean(),
    Match.find({ coupleId: ctx.coupleId }).select('tmdbId').lean(),
  ]);

  // Lo que cualquiera de los dos ha visto (o ya os salió como match) no se propone.
  const excluded = new Set<number>([...matches.map((m) => m.tmdbId)]);
  for (const x of films) if (x.kind === 'watched') excluded.add(x.tmdbId);

  const watchlistOf = new Map<number, Types.ObjectId[]>();
  for (const x of films) {
    if (x.kind !== 'watchlist' || excluded.has(x.tmdbId)) continue;
    const list = watchlistOf.get(x.tmdbId) ?? [];
    list.push(x.userId);
    watchlistOf.set(x.tmdbId, list);
  }

  const queues: Record<DeckSource, number[]> = { watchlist: [], recommended: [], popular: [] };

  if (f.sources.includes('watchlist')) {
    // Primero las que están en las dos watchlists.
    const both = [...watchlistOf].filter(([, u]) => u.length > 1).map(([id]) => id);
    const one = [...watchlistOf].filter(([, u]) => u.length === 1).map(([id]) => id);
    queues.watchlist = [...shuffle(both, seed), ...shuffle(one, seed + 1)];
  }

  if (f.sources.includes('recommended')) {
    // Semillas: lo que más os ha gustado (nota ≥ 4), lo más reciente primero.
    const liked = films
      .filter((x) => x.kind === 'watched' && (x.rating ?? 0) >= 4)
      .sort((a, b) => (b.date ? +new Date(b.date) : 0) - (a.date ? +new Date(a.date) : 0));
    const seeds = shuffle([...new Set(liked.slice(0, 30).map((x) => x.tmdbId))], seed + 2).slice(0, 8);
    const lists = await mapLimit(seeds, 4, (id) => recommendations(id).catch(() => [] as number[]));
    const score = new Map<number, number>();
    lists.forEach((l) => l.forEach((id, i) => score.set(id, (score.get(id) ?? 0) + 1 + (20 - Math.min(i, 20)) / 40)));
    queues.recommended = [...score].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }

  if (f.sources.includes('popular')) {
    const df = {
      genres: f.genres,
      maxRuntime: f.maxRuntime,
      minYear: f.minYear,
      maxYear: f.maxYear,
      providers: f.onlyMyProviders ? ctx.providers : null,
    };
    // La página 1 siempre (dice cuántas hay) y dos más al azar entre las que existen (hasta la 8),
    // para no ver siempre las mismas sin pedir páginas vacías cuando los filtros dejan pocas.
    const first = await discover(df, 1).catch(() => ({ ids: [] as number[], totalPages: 1 }));
    const others = shuffle(
      Array.from({ length: Math.min(first.totalPages, 8) - 1 }, (_, i) => i + 2),
      seed + 3,
    ).slice(0, 2);
    const lists = await mapLimit(others, 2, (p) => discover(df, p).then((r) => r.ids).catch(() => [] as number[]));
    queues.popular = shuffle([...new Set([...first.ids, ...lists.flat()])], seed + 4);
  }

  // Se van cogiendo por turnos (watchlist, recomendada, popular) y se comprueban los filtros
  // con la ficha completa, en tandas para no pedir a TMDB más de lo necesario.
  const deck: DeckCard[] = [];
  const used = new Set<number>();
  const order: DeckSource[] = ['watchlist', 'recommended', 'popular'].filter((s) => f.sources.includes(s as DeckSource)) as DeckSource[];
  const pos: Record<DeckSource, number> = { watchlist: 0, recommended: 0, popular: 0 };
  // Si una película sale por varias vías, se etiqueta con la más informativa.
  const inWatchlists = new Set(queues.watchlist);
  const inRecommended = new Set(queues.recommended);
  const bestReason = (id: number, src: DeckSource): DeckSource =>
    inWatchlists.has(id) ? 'watchlist' : inRecommended.has(id) ? 'recommended' : src;
  let guard = 0;
  while (deck.length < DECK_SIZE && guard++ < 12) {
    const batch: { id: number; reason: DeckSource }[] = [];
    let empty = true;
    for (let round = 0; round < 6; round++) {
      for (const src of order) {
        const q = queues[src];
        while (pos[src] < q.length) {
          const id = q[pos[src]++];
          if (excluded.has(id) || used.has(id)) continue;
          used.add(id);
          batch.push({ id, reason: bestReason(id, src) });
          empty = false;
          break;
        }
      }
    }
    if (empty) break;
    const movies = await getMovies(batch.map((b) => b.id));
    const byId = new Map(movies.map((m) => [m.tmdbId, m]));
    for (const b of batch) {
      const m = byId.get(b.id);
      if (!m || !passes(m, f, ctx.providers)) continue;
      deck.push({ tmdbId: b.id, reason: b.reason, inWatchlistOf: watchlistOf.get(b.id) ?? [] });
      if (deck.length >= DECK_SIZE) break;
    }
  }
  return deck;
}
