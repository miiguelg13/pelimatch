import mongoose, { Schema, type Types } from 'mongoose';

// ------------------------------------------------------------------ Usuario
// No hay contraseñas: la app crea el usuario en el primer arranque y guarda un token
// aleatorio en el almacenamiento seguro del móvil. En la base de datos solo está su hash.
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  tokenHash: string;
  coupleId?: Types.ObjectId | null;
  letterboxdUser?: string | null;
  lastRssAt?: Date | null;
  createdAt: Date;
}
const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    tokenHash: { type: String, required: true, unique: true },
    coupleId: { type: Schema.Types.ObjectId, ref: 'Couple', default: null, index: true },
    letterboxdUser: { type: String, default: null, lowercase: true, trim: true },
    lastRssAt: { type: Date, default: null },
  },
  { timestamps: true },
);
export const User = mongoose.model<IUser>('User', userSchema);

// ------------------------------------------------------------------ Pareja
export interface ICouple {
  _id: Types.ObjectId;
  /** Código de 6 caracteres para que el otro se una. */
  code: string;
  members: Types.ObjectId[];
  /** Plataformas que tenéis (ids de proveedor de TMDB). */
  providers: number[];
  createdAt: Date;
}
const coupleSchema = new Schema<ICouple>(
  {
    code: { type: String, required: true, unique: true },
    members: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
    providers: { type: [Number], default: [] },
  },
  { timestamps: true },
);
export const Couple = mongoose.model<ICouple>('Couple', coupleSchema);

// ------------------------------------------------- Películas de cada usuario
export type FilmKind = 'watched' | 'watchlist';
export interface IUserFilm {
  userId: Types.ObjectId;
  tmdbId: number;
  kind: FilmKind;
  source: 'csv' | 'rss' | 'app';
  /** Nota de Letterboxd (0,5 a 5) si la hay. */
  rating?: number | null;
  date?: Date | null;
}
const userFilmSchema = new Schema<IUserFilm>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    tmdbId: { type: Number, required: true },
    kind: { type: String, enum: ['watched', 'watchlist'], required: true },
    source: { type: String, enum: ['csv', 'rss', 'app'], required: true },
    rating: { type: Number, default: null },
    date: { type: Date, default: null },
  },
  { timestamps: true },
);
userFilmSchema.index({ userId: 1, tmdbId: 1, kind: 1 }, { unique: true });
export const UserFilm = mongoose.model<IUserFilm>('UserFilm', userFilmSchema);

// ------------------------------------------------------ Caché de películas
export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}
export interface IMovie {
  tmdbId: number;
  title: string;
  originalTitle: string;
  year: number | null;
  runtime: number | null;
  genres: { id: number; name: string }[];
  overview: string;
  posterPath: string | null;
  backdropPath: string | null;
  voteAverage: number;
  voteCount: number;
  /** Plataformas en el país configurado (suscripción, alquiler y compra). */
  providers: { flatrate: Provider[]; rent: Provider[]; buy: Provider[]; link: string | null };
  trailerKey: string | null;
  director: string | null;
  cast: string[];
  fetchedAt: Date;
}
const providerSchema = new Schema<Provider>({ id: Number, name: String, logo: String }, { _id: false });
const movieSchema = new Schema<IMovie>({
  tmdbId: { type: Number, required: true, unique: true },
  title: String,
  originalTitle: String,
  year: Number,
  runtime: Number,
  genres: [{ _id: false, id: Number, name: String }],
  overview: String,
  posterPath: String,
  backdropPath: String,
  voteAverage: Number,
  voteCount: Number,
  providers: {
    flatrate: [providerSchema],
    rent: [providerSchema],
    buy: [providerSchema],
    link: String,
  },
  trailerKey: String,
  director: String,
  cast: [String],
  fetchedAt: { type: Date, required: true },
});
export const Movie = mongoose.model<IMovie>('Movie', movieSchema);

/** Título + año de Letterboxd → id de TMDB (null si no se encontró), para no buscar dos veces. */
export interface ITitleLookup {
  key: string;
  tmdbId: number | null;
}
const titleLookupSchema = new Schema<ITitleLookup>({
  key: { type: String, required: true, unique: true },
  tmdbId: { type: Number, default: null },
});
export const TitleLookup = mongoose.model<ITitleLookup>('TitleLookup', titleLookupSchema);

// ------------------------------------------------------ Importaciones
export interface IImportJob {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  matched: number;
  unmatched: string[];
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
const importJobSchema = new Schema<IImportJob>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ['running', 'done', 'error'], default: 'running' },
    total: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    unmatched: { type: [String], default: [] },
    error: { type: String, default: null },
  },
  { timestamps: true },
);
export const ImportJob = mongoose.model<IImportJob>('ImportJob', importJobSchema);

// ------------------------------------------------------ Sesiones de deslizar
export type DeckSource = 'watchlist' | 'popular' | 'recommended';
export interface SessionFilters {
  sources: DeckSource[];
  genres: number[];
  maxRuntime: number | null;
  minYear: number | null;
  maxYear: number | null;
  /** Solo películas disponibles en vuestras plataformas. */
  onlyMyProviders: boolean;
}
export interface DeckCard {
  tmdbId: number;
  /** Por qué sale: en la watchlist de alguien, popular o recomendada. */
  reason: DeckSource;
  /** Ids de los usuarios que la tienen en su watchlist. */
  inWatchlistOf: Types.ObjectId[];
}
export interface ISession {
  _id: Types.ObjectId;
  coupleId: Types.ObjectId;
  createdBy: Types.ObjectId;
  filters: SessionFilters;
  deck: DeckCard[];
  status: 'active' | 'closed';
  createdAt: Date;
}
const sessionSchema = new Schema<ISession>(
  {
    coupleId: { type: Schema.Types.ObjectId, required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true },
    filters: {
      sources: [String],
      genres: [Number],
      maxRuntime: Number,
      minYear: Number,
      maxYear: Number,
      onlyMyProviders: Boolean,
    },
    deck: [
      {
        _id: false,
        tmdbId: Number,
        reason: String,
        inWatchlistOf: [Schema.Types.ObjectId],
      },
    ],
    status: { type: String, enum: ['active', 'closed'], default: 'active' },
  },
  { timestamps: true },
);
export const Session = mongoose.model<ISession>('Session', sessionSchema);

export interface ISwipe {
  sessionId: Types.ObjectId;
  userId: Types.ObjectId;
  tmdbId: number;
  liked: boolean;
}
const swipeSchema = new Schema<ISwipe>(
  {
    sessionId: { type: Schema.Types.ObjectId, required: true },
    userId: { type: Schema.Types.ObjectId, required: true },
    tmdbId: { type: Number, required: true },
    liked: { type: Boolean, required: true },
  },
  { timestamps: true },
);
swipeSchema.index({ sessionId: 1, userId: 1, tmdbId: 1 }, { unique: true });
export const Swipe = mongoose.model<ISwipe>('Swipe', swipeSchema);

export interface IMatch {
  _id: Types.ObjectId;
  coupleId: Types.ObjectId;
  sessionId: Types.ObjectId;
  tmdbId: number;
  /** Ya la habéis visto (se marca desde la app). */
  watched: boolean;
  createdAt: Date;
}
const matchSchema = new Schema<IMatch>(
  {
    coupleId: { type: Schema.Types.ObjectId, required: true, index: true },
    sessionId: { type: Schema.Types.ObjectId, required: true },
    tmdbId: { type: Number, required: true },
    watched: { type: Boolean, default: false },
  },
  { timestamps: true },
);
matchSchema.index({ coupleId: 1, tmdbId: 1 }, { unique: true });
export const Match = mongoose.model<IMatch>('Match', matchSchema);
