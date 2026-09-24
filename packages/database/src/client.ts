import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';

export interface PrismaConnectionOptions {
  /** Максимум соединений в пуле node-postgres (для Supabase pooler держите небольшим). */
  poolMax?: number;
}

/**
 * Создаёт Prisma Client поверх драйвера node-postgres.
 * Для Supabase используйте URL пулера (Supavisor), см. docs/DEPLOYMENT.md.
 */
export function createPrismaClient(
  connectionString: string,
  options: PrismaConnectionOptions = {},
): PrismaClient {
  return new PrismaClient({ adapter: createPrismaAdapter(connectionString, options) });
}

export function createPrismaAdapter(
  connectionString: string,
  { poolMax }: PrismaConnectionOptions = {},
): PrismaPg {
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  return new PrismaPg({ connectionString, ...(poolMax ? { max: poolMax } : {}) });
}
