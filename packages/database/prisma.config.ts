import { defineConfig } from 'prisma/config';
import { loadDatabaseEnv } from './src/env.js';

loadDatabaseEnv();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Миграции идут через DIRECT_URL (прямое/сессионное подключение Supabase),
    // приложение в runtime — через DATABASE_URL. `prisma generate` БД не требует,
    // поэтому на этапе сборки переменные могут отсутствовать.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || '',
  },
});
