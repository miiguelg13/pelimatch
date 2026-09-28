// Estado global: quién soy, mi pareja, la sesión activa y el socket en tiempo real.
import * as Haptics from 'expo-haptics';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { io, type Socket } from 'socket.io-client';
import { api, ApiError, API_URL, setApiToken, tokenStore } from './api';
import type { Me, Movie, Session } from './types';

type Boot = 'loading' | 'ready' | 'offline';

interface Store {
  boot: Boot;
  /** El servidor tarda en despertar (Render gratis): para avisar en la pantalla de carga. */
  slowBoot: boolean;
  me: Me | null;
  session: Session | null;
  /** Match recién hecho, para la celebración (lo limpia quien la cierra). */
  match: Movie | null;
  /** Sube cada vez que cambian los matches (para recargar la lista). */
  matchesVersion: number;
  signUp(name: string): Promise<void>;
  setMe(me: Me): void;
  refreshMe(): Promise<void>;
  refreshSession(): Promise<void>;
  setSession(s: Session | null): void;
  clearMatch(): void;
  showMatch(m: Movie): void;
  retryBoot(): void;
  forgetDevice(): Promise<void>;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<Boot>('loading');
  const [slowBoot, setSlowBoot] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [match, setMatch] = useState<Movie | null>(null);
  const [matchesVersion, setMatchesVersion] = useState(0);
  const [bootTry, setBootTry] = useState(0);
  const socketRef = useRef<Socket | null>(null);

  const paired = !!me?.couple?.complete;

  const refreshMe = useCallback(async () => {
    setMe(await api<Me>('/me'));
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const r = await api<{ session: Session | null }>('/sessions/current');
      setSession(r.session);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'no_couple') setSession(null);
      else throw err;
    }
  }, []);

  // Arranque: token guardado → /me (esperando a que el servidor despierte).
  useEffect(() => {
    let alive = true;
    const slow = setTimeout(() => alive && setSlowBoot(true), 2500);
    (async () => {
      const t = await tokenStore.get();
      if (!t) {
        if (alive) setBoot('ready');
        return;
      }
      setApiToken(t);
      try {
        const m = await api<Me>('/me', { timeoutMs: 90_000 });
        if (!alive) return;
        setToken(t);
        setMe(m);
        setBoot('ready');
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          // Usuario borrado en el servidor: empezar de cero.
          await tokenStore.clear();
          setApiToken(null);
          setBoot('ready');
        } else setBoot('offline');
      }
    })();
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [bootTry]);

  // Sesión activa en cuanto hay pareja completa.
  useEffect(() => {
    if (!paired) return;
    let alive = true;
    api<{ session: Session | null }>('/sessions/current')
      .then((r) => alive && setSession(r.session))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [paired]);

  // Tiempo real.
  useEffect(() => {
    if (!token) return;
    const s = io(API_URL, { auth: { token }, transports: ['websocket'] });
    socketRef.current = s;
    s.on('couple:updated', () => void refreshMe().catch(() => {}));
    s.on('session:new', () => void refreshSession().catch(() => {}));
    s.on('session:closed', () => void refreshSession().catch(() => {}));
    s.on('swipe:progress', (p: { sessionId: string; userId: string; count: number }) =>
      setSession((cur) => (cur && cur.id === p.sessionId ? { ...cur, progress: { ...cur.progress, [p.userId]: p.count } } : cur)),
    );
    s.on('match', (p: { sessionId: string; movie: Movie }) => {
      setSession((cur) => (cur && cur.id === p.sessionId && !cur.matches.includes(p.movie.id) ? { ...cur, matches: [...cur.matches, p.movie.id] } : cur));
      setMatchesVersion((v) => v + 1);
      setMatch(p.movie);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
    s.on('matches:updated', () => setMatchesVersion((v) => v + 1));
    // Al volver a primer plano, ponerse al día por si se perdió algún evento.
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        refreshMe().catch(() => {});
        refreshSession().catch(() => {});
      }
    });
    return () => {
      sub.remove();
      s.close();
      socketRef.current = null;
    };
  }, [token, refreshMe, refreshSession]);

  const signUp = useCallback(async (name: string) => {
    const r = await api<Me & { token: string }>('/users', { method: 'POST', body: { name }, timeoutMs: 90_000 });
    await tokenStore.set(r.token);
    setApiToken(r.token);
    setToken(r.token);
    setMe({ user: r.user, couple: r.couple });
  }, []);

  const forgetDevice = useCallback(async () => {
    await tokenStore.clear();
    setApiToken(null);
    setToken(null);
    setMe(null);
    setSession(null);
  }, []);

  const value = useMemo<Store>(
    () => ({
      boot,
      slowBoot,
      me,
      session: paired ? session : null,
      match,
      matchesVersion,
      signUp,
      setMe,
      refreshMe,
      refreshSession,
      setSession,
      clearMatch: () => setMatch(null),
      showMatch: (m) => {
        setMatch(m);
        setMatchesVersion((v) => v + 1);
      },
      retryBoot: () => {
        setBoot('loading');
        setBootTry((n) => n + 1);
      },
      forgetDevice,
    }),
    [boot, slowBoot, me, paired, session, match, matchesVersion, signUp, refreshMe, refreshSession, forgetDevice],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}

/** Nombre del otro miembro de la pareja. */
export function usePartner() {
  const { me } = useStore();
  return me?.couple?.members.find((m) => m.id !== me.user.id) ?? null;
}
