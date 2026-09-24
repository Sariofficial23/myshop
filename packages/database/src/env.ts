import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Загружает переменные окружения для CLI-скриптов (prisma, seed):
 * сначала packages/database/.env (если есть), затем корневой .env монорепозитория.
 * Уже заданные переменные (Render, CI) не перезаписываются.
 */
export function loadDatabaseEnv(cwd: string = process.cwd()): void {
  for (const path of [resolve(cwd, '.env'), resolve(cwd, '../../.env')]) {
    if (existsSync(path)) {
      config({ path, quiet: true });
    }
  }
}
