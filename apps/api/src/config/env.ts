import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

/**
 * Схема переменных окружения. Приложение не стартует, если конфигурация
 * некорректна — лучше упасть сразу при деплое, чем в середине продажи.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required')
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'DATABASE_URL must be a PostgreSQL URL'),
  /** Размер пула соединений с БД. Для Supabase free-tier рекомендуется 5–10. */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Разрешённые origin для CORS через запятую, например URL фронтенда на Vercel. */
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3001')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    ),
  SWAGGER_ENABLED: booleanString.optional(),
  /** За reverse proxy (Render, Docker + nginx) нужно доверять X-Forwarded-For. */
  TRUST_PROXY: booleanString.default(false),
  THROTTLE_TTL_MS: z.coerce.number().int().positive().default(60_000),
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(120),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

/** Swagger включён по умолчанию везде, кроме production (там — только явно). */
export function isSwaggerEnabled(env: Env): boolean {
  return env.SWAGGER_ENABLED ?? env.NODE_ENV !== 'production';
}
