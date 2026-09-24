import { describe, expect, it } from 'vitest';
import { isSwaggerEnabled, validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('validateEnv', () => {
  it('applies safe defaults', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3001']);
    expect(env.TRUST_PROXY).toBe(false);
  });

  it('parses comma separated CORS origins and strips trailing slashes', () => {
    const env = validateEnv({
      ...base,
      CORS_ORIGINS: 'https://myshop.vercel.app/, https://t.me ,',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://myshop.vercel.app', 'https://t.me']);
  });

  it('fails fast without DATABASE_URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });

  it('rejects non PostgreSQL database URLs', () => {
    expect(() => validateEnv({ DATABASE_URL: 'mysql://localhost/db' })).toThrow(/PostgreSQL/);
  });

  it('disables Swagger in production unless explicitly enabled', () => {
    expect(isSwaggerEnabled(validateEnv({ ...base, NODE_ENV: 'production' }))).toBe(false);
    expect(
      isSwaggerEnabled(validateEnv({ ...base, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })),
    ).toBe(true);
    expect(isSwaggerEnabled(validateEnv(base))).toBe(true);
  });
});
