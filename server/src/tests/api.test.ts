// Recorrido completo: dos usuarios se emparejan, importan Letterboxd, crean una sesión,
// deslizan y les sale un match en tiempo real. Necesita MongoDB (TEST_MONGODB_URI).
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import mongoose from 'mongoose';
import { io as ioClient, type Socket } from 'socket.io-client';
import { createApp } from '../app.js';
import { config } from '../config.js';
import { attachRealtime } from '../realtime.js';
import { rssFor, startFakeTmdb } from './fake-tmdb.js';

const MONGO = process.env.TEST_MONGODB_URI;

describe('API', { skip: !MONGO && 'define TEST_MONGODB_URI' }, () => {
  let fake: ReturnType<typeof startFakeTmdb>;
  let server: Server;
  let base = '';
  const sockets: Socket[] = [];

  before(async () => {
    fake = startFakeTmdb(undefined, {
      lauri: rssFor([
        { id: 3, title: 'Película 3', year: 1983, rating: 5 },
        { id: 4, title: 'Película 4', year: 1984 },
        { id: 15, title: 'Película 15', year: 1995, rating: 4 },
      ]),
    });
    config.tmdbUrl = fake.url;
    config.tmdbToken = 'test-token';
    config.letterboxdUrl = `${fake.url}/lb`;
    await mongoose.connect(`${MONGO!.replace(/\/$/, '')}/pelimatch_test_${Date.now()}`);
    server = createServer(createApp());
    attachRealtime(server);
    await new Promise<void>((r) => server.listen(0, r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    sockets.forEach((s) => s.close());
    server?.close();
    fake?.close();
    await mongoose.connection.db?.dropDatabase();
    await mongoose.disconnect();
  });

  async function call(token: string | null, method: string, path: string, body?: unknown, raw?: Uint8Array) {
    const res = await fetch(base + '/api' + path, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(raw ? { 'Content-Type': 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: raw ? Buffer.from(raw) : body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: (await res.json()) as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  function connect(token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const s = ioClient(base, { auth: { token }, transports: ['websocket'] });
      sockets.push(s);
      s.on('connect', () => resolve(s));
      s.on('connect_error', reject);
    });
  }

  async function waitJob(token: string, id: string) {
    for (let i = 0; i < 100; i++) {
      const r = await call(token, 'GET', `/import/${id}`);
      if (r.data.status !== 'running') return r.data;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('la importación no termina');
  }

  test('recorrido completo', async () => {
    // Sin token no hay nada.
    assert.equal((await call(null, 'GET', '/me')).status, 401);
    // Salud con comprobación de TMDB
    const health = await call(null, 'GET', '/health?tmdb=1');
    assert.deepEqual(health.data, { ok: true, tmdb: { ok: true, genres: 5, providers: 3 } });

    const a = await call(null, 'POST', '/users', { name: 'Miguel' });
    const b = await call(null, 'POST', '/users', { name: 'Laura' });
    assert.equal(a.status, 200);
    const ta = a.data.token as string;
    const tb = b.data.token as string;

    // Emparejarse con código
    const created = await call(ta, 'POST', '/couple');
    const code = created.data.couple.code as string;
    assert.match(code, /^[A-Z2-9]{6}$/);
    assert.equal(created.data.couple.complete, false);
    assert.equal((await call(tb, 'POST', '/couple/join', { code: 'ZZZZZZ' })).status, 404);
    const sb0 = await connect(tb);
    const joined = await call(tb, 'POST', '/couple/join', { code: code.toLowerCase() });
    assert.equal(joined.data.couple.complete, true);
    assert.deepEqual(joined.data.couple.members.map((m: { name: string }) => m.name).sort(), ['Laura', 'Miguel']);
    // Un tercero no cabe
    const c = await call(null, 'POST', '/users', { name: 'Otro' });
    assert.equal((await call(c.data.token, 'POST', '/couple/join', { code })).status, 409);

    // Plataformas
    const provs = await call(ta, 'GET', '/providers');
    assert.equal(provs.data.providers[0].name, 'Netflix');
    await call(ta, 'PUT', '/couple/providers', { providers: [8] });

    // Miguel importa su export (zip): ha visto la 1 y la 2 (con nota), quiere ver la 10 y la 11.
    const zip = zipSync({
      'watched.csv': strToU8('Date,Name,Year,Letterboxd URI\n2024-01-01,Película 1,1981,x\n2024-01-02,Película 2,1982,y\n2024-01-02,No Existe,1999,z\n'),
      'ratings.csv': strToU8('Date,Name,Year,Letterboxd URI,Rating\n2024-01-02,Película 2,1982,y,4.5\n'),
      'watchlist.csv': strToU8('Date,Name,Year,Letterboxd URI\n2024-01-03,Película 10,1990,x\n2024-01-03,Película 11,1991,x\n2024-01-03,Película 1,1981,x\n'),
    });
    const imp = await call(ta, 'POST', '/import?filename=letterboxd.zip', undefined, zip);
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    assert.equal(imp.data.watched, 3);
    const job = await waitJob(ta, imp.data.jobId);
    assert.equal(job.status, 'done');
    assert.equal(job.matched, 5);
    assert.deepEqual(job.unmatched, ['No Existe (1999)']);

    // Laura conecta su Letterboxd por RSS: ha visto la 3, la 4 y la 15 (le gustó). Su watchlist por CSV suelto: la 10 y la 12.
    const patched = await call(tb, 'PATCH', '/me', { letterboxdUser: 'LauRi' });
    assert.equal(patched.status, 200, JSON.stringify(patched.data));
    assert.equal(patched.data.rss.added, 3);
    assert.equal((await call(tb, 'PATCH', '/me', { letterboxdUser: 'nadie' })).status, 400);
    await call(tb, 'PATCH', '/me', { letterboxdUser: 'lauri' });
    const wl = await call(tb, 'POST', '/import?filename=watchlist.csv', undefined, strToU8('Date,Name,Year,Letterboxd URI\n2024-01-03,Película 10,1990,x\n2024-01-03,Película 12,1992,x\n'));
    await waitJob(tb, wl.data.jobId);

    const meA = await call(ta, 'GET', '/me');
    const miguel = meA.data.couple.members.find((m: { name: string }) => m.name === 'Miguel');
    assert.deepEqual([miguel.watched, miguel.watchlist], [2, 2]);

    // Sesión solo con watchlists: la 10 (de los dos) primero, luego 11 y 12; nunca las vistas.
    const sa = await connect(ta);
    const newSession = new Promise((r) => sb0.once('session:new', r));
    const s1 = await call(ta, 'POST', '/sessions', { sources: ['watchlist'] });
    assert.equal(s1.status, 200, JSON.stringify(s1.data));
    await newSession;
    const ids = s1.data.cards.map((c: { id: number }) => c.id);
    assert.equal(ids[0], 10);
    assert.deepEqual([...ids].sort((x: number, y: number) => x - y), [10, 11, 12]);
    assert.equal(s1.data.cards[0].inWatchlistOf.length, 2);
    assert.ok(s1.data.cards[0].poster.startsWith('https://image.tmdb.org/'));
    assert.equal(s1.data.cards[0].trailer, 'https://www.youtube.com/watch?v=yt10');

    // Sesión con populares + recomendadas y filtros: nada visto, todo en Netflix y ≤ 120 min.
    const s2 = await call(tb, 'POST', '/sessions', { sources: ['popular', 'recommended'], maxRuntime: 120, onlyMyProviders: true });
    assert.equal(s2.status, 200, JSON.stringify(s2.data));
    const cards = s2.data.cards as { id: number; runtime: number; providers: { id: number }[]; reason: string }[];
    assert.ok(cards.length > 5);
    for (const card of cards) {
      assert.ok(![1, 2, 3, 4, 15].includes(card.id), `propone una vista: ${card.id}`);
      assert.ok(card.runtime <= 120);
      assert.ok(card.providers.some((p) => p.id === 8));
    }
    assert.ok(cards.some((c) => c.reason === 'recommended'));
    // Filtros imposibles → error claro
    const empty = await call(ta, 'POST', '/sessions', { sources: ['watchlist'], genres: [99999] });
    assert.equal(empty.status, 422);

    // Deslizar: match cuando los dos dicen que sí
    const current = await call(ta, 'GET', '/sessions/current');
    const sid = current.data.session.id as string;
    const [m1, m2] = [cards[0].id, cards[1].id];
    const matchEvent = new Promise<{ movie: { id: number } }>((r) => sa.once('match', r));
    const progress = new Promise<{ count: number }>((r) => sa.once('swipe:progress', r));
    assert.equal((await call(tb, 'POST', `/sessions/${sid}/swipe`, { tmdbId: m1, liked: true })).data.match, null);
    assert.equal((await progress).count, 1);
    await call(tb, 'POST', `/sessions/${sid}/swipe`, { tmdbId: m2, liked: false });
    await call(ta, 'POST', `/sessions/${sid}/swipe`, { tmdbId: m2, liked: true });
    const r = await call(ta, 'POST', `/sessions/${sid}/swipe`, { tmdbId: m1, liked: true });
    assert.equal(r.data.match.id, m1);
    assert.equal((await matchEvent).movie.id, m1);
    assert.equal((await call(ta, 'POST', `/sessions/${sid}/swipe`, { tmdbId: 999, liked: true })).status, 400);

    const again = await call(tb, 'GET', '/sessions/current');
    assert.deepEqual(again.data.session.matches, [m1]);
    assert.equal(Object.keys(again.data.session.mySwipes).length, 2);

    // Matches: marcar como vista la quita de futuras sesiones
    const matches = await call(tb, 'GET', '/matches');
    assert.equal(matches.data.matches.length, 1);
    await call(tb, 'PATCH', `/matches/${matches.data.matches[0].id}`, { watched: true });
    const s3 = await call(ta, 'POST', '/sessions', { sources: ['popular'], maxRuntime: 120, onlyMyProviders: true });
    assert.ok(!s3.data.cards.some((c: { id: number }) => c.id === m1));

    // Dejar la pareja
    const left = await call(tb, 'POST', '/couple/leave');
    assert.equal(left.data.couple, null);
    assert.equal((await call(tb, 'GET', '/sessions/current')).status, 409);
  });
});
