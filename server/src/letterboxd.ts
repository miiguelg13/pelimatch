// Datos de Letterboxd sin API (Letterboxd no la da a proyectos personales):
//  - El export oficial (Ajustes → Import & Export → Export your data): un .zip con
//    watched.csv, watchlist.csv, ratings.csv, diary.csv… Columnas: Date, Name, Year, Letterboxd URI[, Rating].
//  - El RSS público del diario: https://letterboxd.com/<usuario>/rss/ (últimas ~50 entradas,
//    cada una con <tmdb:movieId>, así que no hace falta buscarlas).
import { parse } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';
import { unzipSync, strFromU8 } from 'fflate';
import { config } from './config.js';

export interface LbEntry {
  kind: 'watched' | 'watchlist';
  name: string;
  year: number | null;
  rating: number | null;
  date: Date | null;
}

export class LetterboxdError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LetterboxdError';
  }
}

function toDate(s: unknown): Date | null {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const d = new Date(s.slice(0, 10) + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYear(s: unknown): number | null {
  const n = Number(s);
  return Number.isInteger(n) && n > 1870 && n < 2100 ? n : null;
}

function toRating(s: unknown): number | null {
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 5 ? n : null;
}

/** Lee un CSV de Letterboxd. */
export function parseCsv(text: string, kind: LbEntry['kind']): LbEntry[] {
  const rows = parse(text.replace(/^﻿/, ''), { columns: true, skip_empty_lines: true, relax_column_count: true }) as Record<
    string,
    string
  >[];
  if (rows.length && !('Name' in rows[0])) throw new LetterboxdError('El CSV no parece de Letterboxd (falta la columna Name)');
  return rows
    .filter((r) => r.Name?.trim())
    .map((r) => ({
      kind,
      name: r.Name.trim(),
      year: toYear(r.Year),
      rating: toRating(r.Rating),
      date: toDate(r['Watched Date'] || r.Date),
    }));
}

/** Qué contiene cada fichero del export. */
const FILES: Record<string, LbEntry['kind']> = {
  'watched.csv': 'watched',
  'ratings.csv': 'watched',
  'diary.csv': 'watched',
  'watchlist.csv': 'watchlist',
};

/**
 * Lee el export de Letterboxd: el .zip entero o un CSV suelto (`hint` = nombre del fichero).
 * Junta watched + ratings + diary (de ahí salen las notas) y quita duplicados.
 */
export function parseExport(data: Uint8Array, hint = ''): LbEntry[] {
  let entries: LbEntry[] = [];
  const isZip = data[0] === 0x50 && data[1] === 0x4b;
  if (isZip) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(data, {
        // Solo los CSV de la raíz (la carpeta deleted/ son cosas borradas).
        filter: (f) => !f.name.includes('/') && f.name.toLowerCase() in FILES,
      });
    } catch {
      throw new LetterboxdError('No se pudo abrir el .zip');
    }
    for (const [name, bytes] of Object.entries(files)) entries.push(...parseCsv(strFromU8(bytes), FILES[name.toLowerCase()]));
    if (!entries.length) throw new LetterboxdError('El .zip no tiene watched.csv ni watchlist.csv: ¿es el export de Letterboxd?');
  } else {
    const base = hint.toLowerCase().split(/[\\/]/).pop() ?? '';
    const kind = FILES[base] ?? (base.includes('watchlist') ? 'watchlist' : 'watched');
    entries = parseCsv(strFromU8(data), kind);
  }
  return dedupe(entries);
}

/** Una entrada por película y tipo; se queda con la nota y la fecha más recientes. */
export function dedupe(entries: LbEntry[]): LbEntry[] {
  const map = new Map<string, LbEntry>();
  for (const e of entries) {
    const key = `${e.kind}|${e.name.toLowerCase()}|${e.year ?? ''}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...e });
      continue;
    }
    if (e.rating != null && (prev.rating == null || (e.date && prev.date && e.date > prev.date))) prev.rating = e.rating;
    if (e.date && (!prev.date || e.date > prev.date)) prev.date = e.date;
  }
  return [...map.values()];
}

export interface RssEntry {
  tmdbId: number;
  name: string;
  year: number | null;
  rating: number | null;
  date: Date | null;
}

const xml = new XMLParser({ ignoreAttributes: true, parseTagValue: false, isArray: (name) => name === 'item' });

/** Lee el RSS del diario (solo entradas de películas vistas, no listas ni reseñas sueltas). */
export function parseRss(text: string): RssEntry[] {
  const doc = xml.parse(text) as { rss?: { channel?: { item?: Record<string, unknown>[] } } };
  const items = doc.rss?.channel?.item ?? [];
  const out: RssEntry[] = [];
  for (const it of items) {
    const id = Number(it['tmdb:movieId']);
    if (!Number.isInteger(id) || id <= 0) continue;
    out.push({
      tmdbId: id,
      name: String(it['letterboxd:filmTitle'] ?? ''),
      year: toYear(it['letterboxd:filmYear']),
      rating: toRating(it['letterboxd:memberRating']),
      date: toDate(it['letterboxd:watchedDate']),
    });
  }
  return out;
}

/** Descarga el RSS público de un usuario de Letterboxd. */
export async function fetchRss(user: string): Promise<RssEntry[]> {
  if (!/^[a-z0-9_]{1,40}$/i.test(user)) throw new LetterboxdError('Usuario de Letterboxd no válido');
  const res = await fetch(`${config.letterboxdUrl}/${encodeURIComponent(user)}/rss/`, {
    headers: { 'User-Agent': 'Pelimatch/0.1 (app personal)', Accept: 'application/rss+xml' },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) throw new LetterboxdError(`No existe el usuario «${user}» en Letterboxd`);
  if (!res.ok) throw new LetterboxdError(`Letterboxd respondió ${res.status}`);
  return parseRss(await res.text());
}
