// Importa las películas de Letterboxd de un usuario: busca cada título en TMDB (con caché)
// y lo guarda como vista o en su watchlist. Se ejecuta en segundo plano; la app consulta el progreso.
import type { Types } from 'mongoose';
import { fetchRss, type LbEntry } from './letterboxd.js';
import { ImportJob, User, UserFilm, type IImportJob } from './models.js';
import { findMovieId, mapLimit } from './tmdb.js';

async function saveFilm(
  userId: Types.ObjectId,
  tmdbId: number,
  kind: 'watched' | 'watchlist',
  source: 'csv' | 'rss' | 'app',
  rating: number | null,
  date: Date | null,
) {
  // Algo que ya has visto no vuelve a la watchlist.
  if (kind === 'watchlist' && (await UserFilm.exists({ userId, tmdbId, kind: 'watched' }))) return;
  await UserFilm.updateOne(
    { userId, tmdbId, kind },
    {
      $set: { source, ...(rating != null ? { rating } : {}), ...(date ? { date } : {}) },
      $setOnInsert: { userId, tmdbId, kind },
    },
    { upsert: true },
  );
  // Si la has visto, ya no está pendiente.
  if (kind === 'watched') await UserFilm.deleteOne({ userId, tmdbId, kind: 'watchlist' });
}

export { saveFilm };

/** Crea el trabajo y lo procesa en segundo plano. Devuelve el trabajo recién creado. */
export async function startImport(userId: Types.ObjectId, entries: LbEntry[]): Promise<IImportJob> {
  const job = await ImportJob.create({ userId, total: entries.length });
  void runImport(job._id, userId, entries);
  return job.toObject();
}

export async function runImport(jobId: Types.ObjectId, userId: Types.ObjectId, entries: LbEntry[]): Promise<void> {
  let done = 0;
  let matched = 0;
  const unmatched: string[] = [];
  let lastSave = 0;
  const save = async (force = false) => {
    if (!force && Date.now() - lastSave < 1000) return;
    lastSave = Date.now();
    await ImportJob.updateOne({ _id: jobId }, { $set: { done, matched, unmatched: unmatched.slice(0, 200) } });
  };
  try {
    // Primero todas las vistas y después la watchlist: así una película vista que sigue
    // en la watchlist acaba solo como vista (en paralelo podrían cruzarse).
    const one = async (e: LbEntry) => {
      try {
        const id = await findMovieId(e.name, e.year);
        if (id === null) unmatched.push(`${e.name}${e.year ? ` (${e.year})` : ''}`);
        else {
          await saveFilm(userId, id, e.kind, 'csv', e.rating, e.date);
          matched++;
        }
      } catch (err) {
        unmatched.push(`${e.name}${e.year ? ` (${e.year})` : ''}`);
        console.warn(`[import] ${e.name}: ${(err as Error).message}`);
      }
      done++;
      await save();
    };
    await mapLimit(entries.filter((e) => e.kind === 'watched'), 6, one);
    await mapLimit(entries.filter((e) => e.kind === 'watchlist'), 6, one);
    await ImportJob.updateOne({ _id: jobId }, { $set: { status: 'done', done, matched, unmatched: unmatched.slice(0, 200) } });
  } catch (err) {
    await ImportJob.updateOne({ _id: jobId }, { $set: { status: 'error', error: (err as Error).message, done, matched } });
  }
}

/** Lee el RSS de Letterboxd del usuario y guarda lo nuevo como visto. Devuelve cuántas añadió. */
export async function syncRss(userId: Types.ObjectId): Promise<{ added: number; total: number }> {
  const user = await User.findById(userId);
  if (!user?.letterboxdUser) return { added: 0, total: 0 };
  const entries = await fetchRss(user.letterboxdUser);
  let added = 0;
  for (const e of entries) {
    const exists = await UserFilm.exists({ userId, tmdbId: e.tmdbId, kind: 'watched' });
    await saveFilm(userId, e.tmdbId, 'watched', 'rss', e.rating, e.date);
    if (!exists) added++;
  }
  user.lastRssAt = new Date();
  await user.save();
  return { added, total: entries.length };
}

/** Sincroniza el RSS de todos los usuarios con Letterboxd configurado. */
export async function syncAllRss(): Promise<void> {
  const users = await User.find({ letterboxdUser: { $ne: null } }).select('_id letterboxdUser');
  for (const u of users) {
    try {
      const r = await syncRss(u._id);
      if (r.added) console.log(`[rss] ${u.letterboxdUser}: ${r.added} nuevas`);
    } catch (err) {
      console.warn(`[rss] ${u.letterboxdUser}: ${(err as Error).message}`);
    }
  }
}
