import { createHash, randomBytes } from 'node:crypto';
import express, { Router, type NextFunction, type Request, type Response } from 'express';
import mongoose, { type Types } from 'mongoose';
import { z } from 'zod';
import { buildDeck } from './deck.js';
import { emitToCouple, syncUserRooms } from './events.js';
import { saveFilm, startImport, syncRss } from './importer.js';
import { LetterboxdError, parseExport } from './letterboxd.js';
import {
  Couple,
  ImportJob,
  Match,
  Session,
  Swipe,
  User,
  UserFilm,
  type ICouple,
  type IMovie,
  type ISession,
  type IUser,
} from './models.js';
import { getGenres, getMovie, getMovies, getRegionProviders, posterUrl, TmdbError } from './tmdb.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user: mongoose.HydratedDocument<IUser>;
    }
  }
}

export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res)
    .then((data) => {
      if (!res.headersSent) res.json(data ?? { ok: true });
    })
    .catch(next);

function body<T>(schema: z.ZodType<T>, value: unknown): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, 'invalid_body', r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  return r.data;
}

/** Usuario a partir del token del móvil (cabecera Authorization: Bearer …). */
export async function userFromToken(token: string | undefined | null) {
  if (!token) return null;
  return User.findOne({ tokenHash: hashToken(token) });
}

async function auth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    const user = await userFromToken(token);
    if (!user) throw new HttpError(401, 'unauthorized', 'Sesión no válida');
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------- formatos

/** Ficha para la app (con URLs de imagen completas). */
export function movieOut(m: IMovie) {
  return {
    id: m.tmdbId,
    title: m.title,
    originalTitle: m.originalTitle,
    year: m.year,
    runtime: m.runtime,
    genres: m.genres.map((g) => g.name),
    overview: m.overview,
    poster: posterUrl(m.posterPath, 'w500'),
    backdrop: posterUrl(m.backdropPath, 'w780'),
    rating: Math.round(m.voteAverage * 10) / 10,
    providers: m.providers.flatrate,
    rentOrBuy: [...m.providers.rent, ...m.providers.buy].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i),
    watchLink: m.providers.link,
    trailer: m.trailerKey ? `https://www.youtube.com/watch?v=${m.trailerKey}` : null,
    director: m.director,
    cast: m.cast,
  };
}

async function coupleOf(user: IUser): Promise<mongoose.HydratedDocument<ICouple> | null> {
  return user.coupleId ? Couple.findById(user.coupleId) : null;
}

async function requireCouple(user: IUser) {
  const c = await coupleOf(user);
  if (!c || c.members.length < 2) throw new HttpError(409, 'no_couple', 'Primero tenéis que emparejaros');
  return c;
}

async function memberInfo(ids: Types.ObjectId[]) {
  const users = await User.find({ _id: { $in: ids } }).lean();
  const counts = await UserFilm.aggregate<{ _id: { u: Types.ObjectId; k: string }; n: number }>([
    { $match: { userId: { $in: ids } } },
    { $group: { _id: { u: '$userId', k: '$kind' }, n: { $sum: 1 } } },
  ]);
  return users.map((u) => ({
    id: String(u._id),
    name: u.name,
    letterboxdUser: u.letterboxdUser ?? null,
    watched: counts.find((c) => String(c._id.u) === String(u._id) && c._id.k === 'watched')?.n ?? 0,
    watchlist: counts.find((c) => String(c._id.u) === String(u._id) && c._id.k === 'watchlist')?.n ?? 0,
  }));
}

async function me(user: IUser) {
  const couple = await coupleOf(user);
  return {
    user: { id: String(user._id), name: user.name, letterboxdUser: user.letterboxdUser ?? null },
    couple: couple
      ? {
          id: String(couple._id),
          code: couple.code,
          complete: couple.members.length >= 2,
          members: await memberInfo(couple.members),
          providers: couple.providers,
        }
      : null,
  };
}

async function sessionOut(s: ISession, user: IUser) {
  const movies = await getMovies(s.deck.map((c) => c.tmdbId));
  const byId = new Map(movies.map((m) => [m.tmdbId, m]));
  const swipes = await Swipe.find({ sessionId: s._id }).lean();
  const mine = swipes.filter((w) => String(w.userId) === String(user._id));
  const matches = await Match.find({ sessionId: s._id }).lean();
  return {
    id: String(s._id),
    status: s.status,
    filters: s.filters,
    createdAt: s.createdAt,
    cards: s.deck
      .filter((c) => byId.has(c.tmdbId))
      .map((c) => ({
        ...movieOut(byId.get(c.tmdbId)!),
        reason: c.reason,
        inWatchlistOf: c.inWatchlistOf.map(String),
      })),
    mySwipes: Object.fromEntries(mine.map((w) => [w.tmdbId, w.liked])),
    progress: Object.fromEntries(
      [...new Set(swipes.map((w) => String(w.userId)))].map((u) => [u, swipes.filter((w) => String(w.userId) === u).length]),
    ),
    matches: matches.map((m) => m.tmdbId),
  };
}

function newCode(): string {
  // Sin letras que se confundan (0/O, 1/I).
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  return [...bytes].map((b) => abc[b % abc.length]).join('');
}

// ---------------------------------------------------------------- rutas

export const api = Router();

api.get(
  '/health',
  h(async (req, res) => {
    const db = mongoose.connection.readyState === 1;
    const out: { ok: boolean; tmdb?: { ok: boolean; genres?: number; providers?: number; error?: string } } = { ok: db };
    // ?tmdb=1 comprueba también que el token de TMDB funciona (sin enseñar nada de él).
    if (req.query.tmdb) {
      try {
        const [genres, providers] = await Promise.all([getGenres(), getRegionProviders()]);
        out.tmdb = { ok: true, genres: genres.length, providers: providers.length };
      } catch (err) {
        out.tmdb = { ok: false, error: err instanceof TmdbError ? err.message : 'error' };
      }
    }
    res.status(db && out.tmdb?.ok !== false ? 200 : 503).json(out);
  }),
);

/** Primer arranque de la app: crea el usuario y devuelve su token (solo esta vez). */
api.post(
  '/users',
  h(async (req) => {
    const { name } = body(z.object({ name: z.string().trim().min(1).max(40) }), req.body);
    const token = randomBytes(32).toString('base64url');
    const user = await User.create({ name, tokenHash: hashToken(token) });
    return { token, ...(await me(user)) };
  }),
);

api.use(auth);

api.get(
  '/me',
  h(async (req) => me(req.user)),
);

api.patch(
  '/me',
  h(async (req) => {
    const b = body(
      z.object({
        name: z.string().trim().min(1).max(40).optional(),
        letterboxdUser: z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_]{1,40}$/, 'usuario de Letterboxd no válido')
          .nullable()
          .optional(),
      }),
      req.body,
    );
    if (b.name) req.user.name = b.name;
    if (b.letterboxdUser !== undefined) req.user.letterboxdUser = b.letterboxdUser ? b.letterboxdUser.toLowerCase() : null;
    await req.user.save();
    let rss: { added: number; total: number } | null = null;
    if (b.letterboxdUser) {
      try {
        rss = await syncRss(req.user._id);
      } catch (err) {
        if (err instanceof LetterboxdError) throw new HttpError(400, 'letterboxd', err.message);
        throw err;
      }
    }
    emitToCouple(req.user.coupleId, 'couple:updated', {});
    return { ...(await me(req.user)), rss };
  }),
);

// ------------------------------------------------------------- pareja

api.post(
  '/couple',
  h(async (req) => {
    if (req.user.coupleId) throw new HttpError(409, 'already_paired', 'Ya estás en una pareja');
    let couple = null;
    for (let i = 0; i < 5 && !couple; i++) {
      try {
        couple = await Couple.create({ code: newCode(), members: [req.user._id] });
      } catch {
        /* código repetido: otro intento */
      }
    }
    if (!couple) throw new HttpError(500, 'code_failed');
    req.user.coupleId = couple._id;
    await req.user.save();
    syncUserRooms(req.user._id, couple._id);
    return me(req.user);
  }),
);

api.post(
  '/couple/join',
  h(async (req) => {
    const { code } = body(z.object({ code: z.string().trim().toUpperCase().length(6) }), req.body);
    const couple = await Couple.findOne({ code });
    if (!couple) throw new HttpError(404, 'bad_code', 'No hay ninguna pareja con ese código');
    if (couple.members.some((m) => String(m) === String(req.user._id))) return me(req.user);
    if (couple.members.length >= 2) throw new HttpError(409, 'couple_full', 'Esa pareja ya está completa');
    if (req.user.coupleId) {
      // Si estaba esperando en otra pareja vacía, la deja.
      const old = await Couple.findById(req.user.coupleId);
      if (old && old.members.length <= 1) await old.deleteOne();
    }
    couple.members.push(req.user._id);
    await couple.save();
    req.user.coupleId = couple._id;
    await req.user.save();
    syncUserRooms(req.user._id, couple._id);
    emitToCouple(couple._id, 'couple:updated', {});
    return me(req.user);
  }),
);

api.post(
  '/couple/leave',
  h(async (req) => {
    const couple = await coupleOf(req.user);
    if (couple) {
      couple.members = couple.members.filter((m) => String(m) !== String(req.user._id));
      if (couple.members.length) await couple.save();
      else await couple.deleteOne();
      emitToCouple(couple._id, 'couple:updated', {});
    }
    req.user.coupleId = null;
    await req.user.save();
    syncUserRooms(req.user._id, null);
    return me(req.user);
  }),
);

api.put(
  '/couple/providers',
  h(async (req) => {
    const { providers } = body(z.object({ providers: z.array(z.number().int().positive()).max(50) }), req.body);
    const couple = await coupleOf(req.user);
    if (!couple) throw new HttpError(409, 'no_couple', 'Primero crea o únete a una pareja');
    couple.providers = [...new Set(providers)];
    await couple.save();
    emitToCouple(couple._id, 'couple:updated', {});
    return me(req.user);
  }),
);

api.get(
  '/providers',
  h(async () => ({ providers: await getRegionProviders() })),
);
api.get(
  '/genres',
  h(async () => ({ genres: await getGenres() })),
);

// ------------------------------------------------------------ Letterboxd

/** Sube el export de Letterboxd (.zip o un .csv) como cuerpo binario. */
api.post(
  '/import',
  express.raw({ type: () => true, limit: '20mb' }),
  h(async (req) => {
    const data = req.body as Buffer;
    if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'empty', 'No ha llegado ningún fichero');
    const filename = String(req.query.filename ?? req.headers['x-filename'] ?? '');
    let entries;
    try {
      entries = parseExport(new Uint8Array(data), filename);
    } catch (err) {
      if (err instanceof LetterboxdError) throw new HttpError(400, 'bad_export', err.message);
      throw new HttpError(400, 'bad_export', 'No se pudo leer el fichero');
    }
    const job = await startImport(req.user._id, entries);
    return {
      jobId: String(job._id),
      total: entries.length,
      watched: entries.filter((e) => e.kind === 'watched').length,
      watchlist: entries.filter((e) => e.kind === 'watchlist').length,
    };
  }),
);

api.get(
  '/import/:id',
  h(async (req) => {
    const job = await ImportJob.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!job) throw new HttpError(404, 'not_found');
    return { id: String(job._id), status: job.status, total: job.total, done: job.done, matched: job.matched, unmatched: job.unmatched, error: job.error };
  }),
);

api.post(
  '/letterboxd/sync',
  h(async (req) => {
    try {
      return await syncRss(req.user._id);
    } catch (err) {
      if (err instanceof LetterboxdError) throw new HttpError(400, 'letterboxd', err.message);
      throw err;
    }
  }),
);

// ------------------------------------------------------------- sesiones

const filtersSchema = z.object({
  sources: z.array(z.enum(['watchlist', 'popular', 'recommended'])).min(1),
  genres: z.array(z.number().int()).default([]),
  maxRuntime: z.number().int().min(30).max(400).nullable().default(null),
  minYear: z.number().int().min(1880).max(2100).nullable().default(null),
  maxYear: z.number().int().min(1880).max(2100).nullable().default(null),
  onlyMyProviders: z.boolean().default(false),
});

api.post(
  '/sessions',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    const filters = body(filtersSchema, req.body);
    const deck = await buildDeck({ coupleId: couple._id, memberIds: couple.members, providers: couple.providers }, filters);
    if (!deck.length) throw new HttpError(422, 'empty_deck', 'No hay películas con esos filtros: prueba a quitar alguno');
    await Session.updateMany({ coupleId: couple._id, status: 'active' }, { $set: { status: 'closed' } });
    const s = await Session.create({ coupleId: couple._id, createdBy: req.user._id, filters, deck });
    emitToCouple(couple._id, 'session:new', { id: String(s._id), by: req.user.name });
    return sessionOut(s.toObject(), req.user);
  }),
);

api.get(
  '/sessions/current',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    const s = await Session.findOne({ coupleId: couple._id, status: 'active' }).sort({ createdAt: -1 }).lean<ISession>();
    return { session: s ? await sessionOut(s, req.user) : null };
  }),
);

api.post(
  '/sessions/:id/swipe',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    const { tmdbId, liked } = body(z.object({ tmdbId: z.number().int(), liked: z.boolean() }), req.body);
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'not_found');
    const s = await Session.findOne({ _id: req.params.id, coupleId: couple._id }).lean<ISession>();
    if (!s) throw new HttpError(404, 'not_found');
    if (!s.deck.some((c) => c.tmdbId === tmdbId)) throw new HttpError(400, 'not_in_deck');
    await Swipe.updateOne({ sessionId: s._id, userId: req.user._id, tmdbId }, { $set: { liked } }, { upsert: true });

    const count = await Swipe.countDocuments({ sessionId: s._id, userId: req.user._id });
    emitToCouple(couple._id, 'swipe:progress', { sessionId: String(s._id), userId: String(req.user._id), count });

    let match = null;
    if (liked) {
      const other = await Swipe.findOne({ sessionId: s._id, tmdbId, liked: true, userId: { $ne: req.user._id } }).lean();
      if (other) {
        const created = await Match.updateOne(
          { coupleId: couple._id, tmdbId },
          { $setOnInsert: { coupleId: couple._id, sessionId: s._id, tmdbId, watched: false } },
          { upsert: true },
        );
        if (created.upsertedCount) {
          match = movieOut(await getMovie(tmdbId));
          emitToCouple(couple._id, 'match', { sessionId: String(s._id), movie: match });
        }
      }
    }
    return { match, count };
  }),
);

api.post(
  '/sessions/:id/close',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'not_found');
    await Session.updateOne({ _id: req.params.id, coupleId: couple._id }, { $set: { status: 'closed' } });
    emitToCouple(couple._id, 'session:closed', { id: req.params.id });
    return { ok: true };
  }),
);

// -------------------------------------------------------------- matches

api.get(
  '/matches',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    const matches = await Match.find({ coupleId: couple._id }).sort({ createdAt: -1 }).limit(200).lean();
    const movies = await getMovies(matches.map((m) => m.tmdbId));
    const byId = new Map(movies.map((m) => [m.tmdbId, m]));
    return {
      matches: matches
        .filter((m) => byId.has(m.tmdbId))
        .map((m) => ({ id: String(m._id), watched: m.watched, createdAt: m.createdAt, movie: movieOut(byId.get(m.tmdbId)!) })),
    };
  }),
);

api.patch(
  '/matches/:id',
  h(async (req) => {
    const couple = await requireCouple(req.user);
    const { watched } = body(z.object({ watched: z.boolean() }), req.body);
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'not_found');
    const m = await Match.findOneAndUpdate({ _id: req.params.id, coupleId: couple._id }, { $set: { watched } }, { new: true });
    if (!m) throw new HttpError(404, 'not_found');
    // Vista juntos: cuenta como vista para los dos (y deja de proponerse).
    if (watched) for (const uid of couple.members) await saveFilm(uid, m.tmdbId, 'watched', 'app', null, new Date());
    emitToCouple(couple._id, 'matches:updated', {});
    return { id: String(m._id), watched: m.watched };
  }),
);

api.get(
  '/movies/:id',
  h(async (req) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
    return movieOut(await getMovie(id));
  }),
);

// -------------------------------------------------------------- errores

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err instanceof TmdbError) {
    res.status(502).json({ error: 'tmdb', message: err.message });
    return;
  }
  if ((err as { type?: string })?.type === 'entity.too.large') {
    res.status(413).json({ error: 'too_large', message: 'El fichero es demasiado grande' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: 'Algo ha fallado en el servidor' });
}
