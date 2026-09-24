import type { AuthResponse } from '@myshop/shared';
import { tokenStore } from '../auth/token-store';
import { publicEnv } from '../env';
import { ApiError } from './api-error';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Базовый URL API; по умолчанию NEXT_PUBLIC_API_URL. */
  baseUrl?: string;
  /** Прикреплять access token (по умолчанию да). */
  auth?: boolean;
}

type AuthListener = (response: AuthResponse | null) => void;
const authListeners = new Set<AuthListener>();

/** Подписка на обновление/потерю сессии (используется AuthProvider). */
export function onAuthChange(listener: AuthListener): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

let refreshInFlight: Promise<boolean> | null = null;

/** Обновляет токены один раз, даже если параллельно упали несколько запросов. */
export function refreshSession(baseUrl = publicEnv.apiUrl): Promise<boolean> {
  refreshInFlight ??= (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (!refreshToken) return false;
    try {
      const response = await rawRequest<AuthResponse>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        baseUrl,
        auth: false,
      });
      tokenStore.set(response);
      authListeners.forEach((listener) => listener(response));
      return true;
    } catch {
      tokenStore.clear();
      authListeners.forEach((listener) => listener(null));
      return false;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

/**
 * Единая точка общения фронтенда с backend.
 * Фронтенд не содержит бизнес-логики — только вызывает REST API.
 * При истёкшем access token один раз пробует обновить сессию и повторяет запрос.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (error) {
    const canRetry =
      options.auth !== false &&
      error instanceof ApiError &&
      error.status === 401 &&
      error.code === 'UNAUTHORIZED' &&
      tokenStore.getRefreshToken() !== null;
    if (canRetry && (await refreshSession(options.baseUrl))) {
      return rawRequest<T>(path, options);
    }
    throw error;
  }
}

async function rawRequest<T>(path: string, options: ApiRequestOptions): Promise<T> {
  const { body, baseUrl = publicEnv.apiUrl, headers, auth = true, ...init } = options;
  const url = `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;
  const accessToken = auth ? tokenStore.getAccessToken() : null;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (cause) {
    throw new ApiError(
      'NETWORK_ERROR',
      0,
      cause instanceof Error ? cause.message : 'Network error',
    );
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw ApiError.fromBody(response.status, payload);
  }
  return payload as T;
}
