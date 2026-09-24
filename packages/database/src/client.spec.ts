import { describe, expect, it } from 'vitest';
import { createPrismaAdapter } from './client.js';

describe('createPrismaAdapter', () => {
  it('fails fast when connection string is missing', () => {
    expect(() => createPrismaAdapter('')).toThrow(/DATABASE_URL/);
  });

  it('creates a pg adapter for a PostgreSQL URL', () => {
    expect(createPrismaAdapter('postgresql://u:p@localhost:5432/db')).toBeDefined();
  });
});
