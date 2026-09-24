import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { LivenessResponse, ReadinessResponse } from '@myshop/shared';
import type { Response } from 'express';
import { APP_NAME, APP_VERSION } from '../config/app-info.js';
import type { Env } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Liveness: процесс запущен и отвечает' })
  @ApiOkResponse({ description: 'Сервис жив' })
  liveness(): LivenessResponse {
    return {
      status: 'ok',
      service: APP_NAME,
      version: APP_VERSION,
      environment: this.config.get('NODE_ENV', { infer: true }),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness: сервис готов (база данных доступна)' })
  @ApiOkResponse({ description: 'Все зависимости доступны' })
  @ApiServiceUnavailableResponse({ description: 'База данных недоступна' })
  async readiness(@Res({ passthrough: true }) res: Response): Promise<ReadinessResponse> {
    let database: ReadinessResponse['checks']['database'];
    try {
      database = { status: 'ok', latencyMs: await this.prisma.ping() };
    } catch {
      database = { status: 'error' };
    }

    const status = database.status === 'ok' ? 'ok' : 'error';
    res.status(status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return { status, checks: { database }, timestamp: new Date().toISOString() };
  }
}
