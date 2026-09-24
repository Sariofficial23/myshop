/**
 * Публичная конфигурация фронтенда. Только NEXT_PUBLIC_* переменные —
 * они встраиваются в JS-бандл и видны всем. Секреты здесь запрещены.
 */
export const publicEnv = {
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
} as const;
