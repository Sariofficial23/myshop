import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

const PING_TIMEOUT_MS = 30_000;

/** Адрес для самопинга или null, если keep-alive выключен. */
export function keepAliveTarget(
  env: Pick<Env, 'NODE_ENV' | 'KEEP_ALIVE_ENABLED' | 'KEEP_ALIVE_URL' | 'RENDER_EXTERNAL_URL'>,
): string | null {
  if (env.NODE_ENV !== 'production' || !env.KEEP_ALIVE_ENABLED) return null;
  const base = env.KEEP_ALIVE_URL ?? env.RENDER_EXTERNAL_URL;
  return base ? `${base.replace(/\/+$/, '')}/api/health` : null;
}

/**
 * Keep-alive: раз в N минут сервер запрашивает свой /api/health через публичный адрес.
 * Запрос проходит через балансировщик Render и считается входящим трафиком,
 * поэтому бесплатный сервис не засыпает и первый вход утром не ждёт 30–60 секунд.
 */
@Injectable()
export class KeepAliveService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(KeepAliveService.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onApplicationBootstrap(): void {
    const url = keepAliveTarget({
      NODE_ENV: this.config.get('NODE_ENV', { infer: true }),
      KEEP_ALIVE_ENABLED: this.config.get('KEEP_ALIVE_ENABLED', { infer: true }),
      KEEP_ALIVE_URL: this.config.get('KEEP_ALIVE_URL', { infer: true }),
      RENDER_EXTERNAL_URL: this.config.get('RENDER_EXTERNAL_URL', { infer: true }),
    });
    if (!url) return;
    const minutes = this.config.get('KEEP_ALIVE_INTERVAL_MINUTES', { infer: true });
    this.timer = setInterval(() => void this.ping(url), minutes * 60_000);
    // Таймер не должен удерживать процесс при остановке
    this.timer.unref();
    this.logger.log(`Keep-alive: ${url} every ${minutes} min`);
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  async ping(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PING_TIMEOUT_MS) });
      if (!res.ok) this.logger.warn(`Keep-alive ping: HTTP ${res.status}`);
      return res.ok;
    } catch (error) {
      this.logger.warn(`Keep-alive ping failed: ${(error as Error).message}`);
      return false;
    }
  }
}
