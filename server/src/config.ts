import 'dotenv/config';

function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  port: num('PORT', 4300),
  mongoUri: process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/pelimatch',
  /** Token de lectura de la API de TMDB («API Read Access Token», empieza por eyJ…). */
  tmdbToken: process.env.TMDB_TOKEN ?? '',
  tmdbUrl: (process.env.TMDB_URL ?? 'https://api.themoviedb.org/3').replace(/\/$/, ''),
  /** País para plataformas y fechas de estreno. */
  region: process.env.REGION ?? 'ES',
  language: process.env.LANGUAGE ?? 'es-ES',
  letterboxdUrl: (process.env.LETTERBOXD_URL ?? 'https://letterboxd.com').replace(/\/$/, ''),
  /** Cada cuánto se leen los RSS de Letterboxd (minutos). */
  rssEveryMinutes: num('RSS_EVERY_MINUTES', 60),
  isProd: process.env.NODE_ENV === 'production',
};
