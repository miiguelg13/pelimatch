export interface Provider {
  id: number;
  name: string;
  logo: string | null;
}

export interface Movie {
  id: number;
  title: string;
  originalTitle: string | null;
  year: number | null;
  runtime: number | null;
  genres: string[];
  overview: string;
  poster: string | null;
  backdrop: string | null;
  rating: number;
  providers: Provider[];
  rentOrBuy: Provider[];
  watchLink: string | null;
  trailer: string | null;
  director: string | null;
  cast: string[];
}

export type DeckSource = 'watchlist' | 'recommended' | 'popular';

export interface Card extends Movie {
  reason: DeckSource;
  inWatchlistOf: string[];
}

export interface Member {
  id: string;
  name: string;
  letterboxdUser: string | null;
  watched: number;
  watchlist: number;
}

export interface Me {
  user: { id: string; name: string; letterboxdUser: string | null };
  couple: {
    id: string;
    code: string;
    complete: boolean;
    members: Member[];
    providers: number[];
  } | null;
}

export interface Filters {
  sources: DeckSource[];
  genres: number[];
  maxRuntime: number | null;
  minYear: number | null;
  maxYear: number | null;
  onlyMyProviders: boolean;
}

export interface Session {
  id: string;
  status: 'active' | 'closed';
  filters: Filters;
  createdAt: string;
  cards: Card[];
  mySwipes: Record<string, boolean>;
  progress: Record<string, number>;
  matches: number[];
}

export interface MatchItem {
  id: string;
  watched: boolean;
  createdAt: string;
  movie: Movie;
}

export interface ImportJob {
  id: string;
  status: 'running' | 'done' | 'error';
  total: number;
  done: number;
  matched: number;
  unmatched: string[];
  error?: string | null;
}
