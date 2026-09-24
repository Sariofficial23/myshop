import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrismaAdapter, PrismaClient } from '@myshop/database';
import type { Env } from '../config/env.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: createPrismaAdapter(config.get('DATABASE_URL', { infer: true }), {
        poolMax: config.get('DATABASE_POOL_MAX', { infer: true }),
      }),
    });
  }

  /** Проверка доступности БД для readiness-проверки. Возвращает задержку в мс. */
  async ping(): Promise<number> {
    const startedAt = performance.now();
    await this.$queryRaw`SELECT 1`;
    return Math.round(performance.now() - startedAt);
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
