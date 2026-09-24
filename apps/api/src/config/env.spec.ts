import { describe, expect, it } from 'vitest';
import { isSwaggerEnabled, validateEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

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
    expect(() => validateEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('requires a strong JWT secret', () => {
    expect(() => validateEnv({ DATABASE_URL: base.DATABASE_URL })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/32/);
  });

  it('applies auth defaults', () => {
    const env = validateEnv(base);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
    expect(env.AUTH_DEV_LOGIN_ENABLED).toBe(false);
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it('treats empty TELEGRAM_BOT_TOKEN as not configured and validates its format', () => {
    expect(validateEnv({ ...base, TELEGRAM_BOT_TOKEN: '' }).TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(() => validateEnv({ ...base, TELEGRAM_BOT_TOKEN: 'nope' })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
  });

  it('forbids dev login in production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', AUTH_DEV_LOGIN_ENABLED: 'true' }),
    ).toThrow(/AUTH_DEV_LOGIN_ENABLED/);
    expect(validateEnv({ ...base, AUTH_DEV_LOGIN_ENABLED: 'true' }).AUTH_DEV_LOGIN_ENABLED).toBe(
      true,
    );
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
