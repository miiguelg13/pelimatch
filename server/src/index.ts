import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb } from './db.js';
import { syncAllRss } from './importer.js';
import { attachRealtime } from './realtime.js';

async function main() {
  const app = createApp();
  const server = createServer(app);
  attachRealtime(server);
  // Primero el puerto (Render lo exige enseguida); /api/health da 503 hasta tener base de datos.
  server.listen(config.port, () => console.log(`[server] http://localhost:${config.port}`));
  await connectDb();
  if (!config.tmdbToken) console.warn('[tmdb] ⚠ falta TMDB_TOKEN: no se podrán buscar películas');
  const every = config.rssEveryMinutes * 60_000;
  setInterval(() => void syncAllRss(), every).unref();
  setTimeout(() => void syncAllRss(), 30_000).unref();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
