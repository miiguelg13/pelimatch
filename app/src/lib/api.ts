import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** Servidor: EXPO_PUBLIC_API_URL (desarrollo) o `extra.apiUrl` de app.json (APK). */
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ??
  'http://localhost:4300'
).replace(/\/$/, '');

const TOKEN_KEY = 'pelimatch.token';

// En el móvil el token va cifrado (SecureStore); en web (solo para pruebas) en localStorage.
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async set(token: string) {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(TOKEN_KEY, token);
    else await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async clear() {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(TOKEN_KEY);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
export const setApiToken = (t: string | null) => {
  token = t;
};

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT';
  body?: unknown;
  /** Cuerpo binario (el export de Letterboxd). */
  raw?: Blob;
  /** Render (plan gratis) tarda hasta ~1 min en despertar: margen amplio. */
  timeoutMs?: number;
}

export async function api<T>(path: string, opts: Options = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 75_000);
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: opts.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.raw ? { 'Content-Type': 'application/octet-stream' } : opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.raw ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
      signal: ctrl.signal,
    });
  } catch {
    throw new ApiError(0, 'network', 'No se puede conectar con el servidor. Revisa tu conexión.');
  } finally {
    clearTimeout(timer);
  }
  const data = (await res.json().catch(() => null)) as ({ error?: string; message?: string } & T) | null;
  if (!res.ok) {
    throw new ApiError(res.status, data?.error ?? 'error', data?.message ?? `Error ${res.status}`);
  }
  return data as T;
}

export const errorText = (err: unknown) => (err instanceof ApiError ? err.message : 'Algo ha fallado. Vuelve a intentarlo.');
