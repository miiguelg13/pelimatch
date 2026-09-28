# Pelimatch

Un «Tinder de películas» para parejas: los dos deslizáis el mismo mazo y, cuando a los dos os gusta una, hay match. El mazo nunca incluye lo que alguno ya ha visto en Letterboxd.

- **App** (`app/`): Expo + React Native, Android.
- **Servidor** (`server/`): Node + Express + MongoDB + Socket.IO. Datos de películas de [TMDB](https://www.themoviedb.org/) y plataformas de JustWatch (vía TMDB).

## De dónde salen las películas

| Fuente | Cómo |
|---|---|
| Vistas (para excluirlas) | Export de Letterboxd (`.zip` o CSV suelto) + RSS público del diario, que se relee cada hora |
| Vuestras watchlists | `watchlist.csv` del export. Las que están en las dos listas salen primero |
| Recomendadas | Recomendaciones de TMDB a partir de lo que habéis puntuado con 4★ o más |
| Populares | `discover` de TMDB con los mismos filtros |

Cada sesión puede filtrar por géneros, duración máxima, rango de años y «solo en nuestras plataformas» (catálogo de España).

## Servidor en local

```bash
cd server
cp .env.example .env      # y rellena TMDB_TOKEN
npm install
npm run dev               # http://localhost:4300/api/health
```

Tests (necesitan un MongoDB; no llaman a TMDB ni a Letterboxd, usan un servidor falso):

```bash
TEST_MONGODB_URI=mongodb://127.0.0.1:27017 npm test
```

## App en local

```bash
cd app
npm install
cp .env.example .env      # pon la IP de tu PC para hablar con tu servidor local
npx expo start            # y abre la app con un development build o el APK
```

Pantallas: bienvenida → pareja (código) → Letterboxd (export + usuario) → plataformas → **Elegir** (mazo para deslizar), **Matches** y **Ajustes**.
El deslizamiento corre en el hilo de UI (Reanimated 4 + Gesture Handler); el match llega por Socket.IO a los dos móviles a la vez.

## API

Autenticación: `Authorization: Bearer <token>` (el token lo da `POST /api/users` y la app lo guarda cifrado en el móvil).

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Estado |
| POST | `/api/users` `{name}` | Crea usuario → `{token, user, couple}` |
| GET / PATCH | `/api/me` `{name?, letterboxdUser?}` | Perfil. Al poner el usuario de Letterboxd se lee su RSS |
| POST | `/api/couple` | Crea pareja → código de 6 letras |
| POST | `/api/couple/join` `{code}` | Unirse (404 código malo, 409 pareja completa) |
| POST | `/api/couple/leave` | Salir |
| PUT | `/api/couple/providers` `{providers: number[]}` | Vuestras plataformas |
| GET | `/api/providers`, `/api/genres` | Catálogos de TMDB |
| POST | `/api/import?filename=…` (binario) | Sube el export de Letterboxd → `{jobId}` |
| GET | `/api/import/:id` | Progreso de la importación |
| POST | `/api/letterboxd/sync` | Relee el RSS ahora |
| POST | `/api/sessions` `{sources, genres, maxRuntime, minYear, maxYear, onlyMyProviders}` | Nueva sesión con su mazo (422 si los filtros lo dejan vacío) |
| GET | `/api/sessions/current` | Sesión activa, tus swipes y los matches |
| POST | `/api/sessions/:id/swipe` `{tmdbId, liked}` | Deslizar → `{match}` |
| POST | `/api/sessions/:id/close` | Cerrar sesión |
| GET | `/api/matches` · PATCH `/api/matches/:id` `{watched}` | Historial de matches |
| GET | `/api/movies/:id` | Ficha completa |

Tiempo real (Socket.IO, `auth: {token}`): `couple:updated`, `session:new`, `session:closed`, `swipe:progress`, `match`, `matches:updated`.

## Despliegue

- Servidor: Render (`render.yaml`) + MongoDB Atlas. `MONGODB_URI` y `TMDB_TOKEN` se ponen a mano en el panel de Render.
- App: APK con EAS Build.

---

This product uses the TMDB API but is not endorsed or certified by TMDB. Datos de plataformas: JustWatch.
