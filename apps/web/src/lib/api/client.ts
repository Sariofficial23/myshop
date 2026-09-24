import { publicEnv } from '../env';
import { ApiError } from './api-error';

export interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Базовый URL API; по умолчанию NEXT_PUBLIC_API_URL. */
  baseUrl?: string;
}

/**
 * Единая точка общения фронтенда с backend.
 * Фронтенд не содержит бизнес-логики — только вызывает REST API.
 * Любая ошибка превращается в ApiError с машиночитаемым кодом.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { body, baseUrl = publicEnv.apiUrl, headers, ...init } = options;
  const url = `${baseUrl}/api${path.startsWith('/') ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
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

  const payload: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw ApiError.fromBody(response.status, payload);
  }
  return payload as T;
}
