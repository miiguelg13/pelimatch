import assert from 'node:assert/strict';
import { test } from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { dedupe, parseCsv, parseExport, parseRss } from '../letterboxd.js';
import { rssFor } from './fake-tmdb.js';
import { normTitle } from '../tmdb.js';

const WATCHED = `Date,Name,Year,Letterboxd URI
2024-01-02,Película 1,1981,https://boxd.it/aa
2024-02-03,"Película, con coma",1999,https://boxd.it/bb
`;
const RATINGS = `Date,Name,Year,Letterboxd URI,Rating
2024-05-05,Película 1,1981,https://boxd.it/aa,4.5
`;
const WATCHLIST = `Date,Name,Year,Letterboxd URI
2025-01-01,Película 9,1989,https://boxd.it/cc
`;

test('parseCsv lee las columnas de Letterboxd', () => {
  const r = parseCsv(WATCHED, 'watched');
  assert.equal(r.length, 2);
  assert.deepEqual(
    r.map((e) => [e.name, e.year]),
    [
      ['Película 1', 1981],
      ['Película, con coma', 1999],
    ],
  );
  assert.throws(() => parseCsv('a,b\n1,2\n', 'watched'), /Name/);
});

test('parseExport abre el zip, junta vistas y notas y quita duplicados', () => {
  const zip = zipSync({
    'watched.csv': strToU8(WATCHED),
    'ratings.csv': strToU8(RATINGS),
    'watchlist.csv': strToU8(WATCHLIST),
    'profile.csv': strToU8('Username\nx\n'),
    'deleted/watched.csv': strToU8(WATCHED),
  });
  const r = parseExport(zip);
  const p1 = r.filter((e) => e.name === 'Película 1');
  assert.equal(p1.length, 1);
  assert.equal(p1[0].rating, 4.5);
  assert.equal(r.filter((e) => e.kind === 'watchlist').length, 1);
  assert.equal(r.length, 3);
});

test('parseExport con un CSV suelto usa el nombre del fichero', () => {
  const r = parseExport(strToU8(WATCHLIST), 'C:\\Descargas\\watchlist.csv');
  assert.equal(r[0].kind, 'watchlist');
  assert.throws(() => parseExport(zipSync({ 'otra.txt': strToU8('x') })), /watched/);
});

test('parseRss saca el id de TMDB y la nota, y salta las listas', () => {
  const r = parseRss(rssFor([{ id: 7, title: 'Película 7', year: 1987, rating: 4 }]));
  assert.deepEqual(r.map((e) => [e.tmdbId, e.rating, e.year]), [[7, 4, 1987]]);
});

test('dedupe y normTitle', () => {
  assert.equal(dedupe([{ kind: 'watched', name: 'A', year: 1, rating: null, date: null }, { kind: 'watched', name: 'a', year: 1, rating: 3, date: null }]).length, 1);
  assert.equal(normTitle('Amélie!  '), 'amelie');
});
