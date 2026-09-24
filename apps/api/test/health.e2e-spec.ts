import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';

/**
 * Требует запущенный PostgreSQL и DATABASE_URL (см. apps/api/.env.example).
 */
describe('Health & platform (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    process.env.CORS_ORIGINS = 'http://localhost:3001';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /api/health → 200 liveness', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'myshop-api' });
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('GET /api/health/ready → 200 when database is reachable', async () => {
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.status).toBe('ok');
    expect(typeof res.body.checks.database.latencyMs).toBe('number');
  });

  it('unknown route → 404 in unified error format', async () => {
    const res = await request(app.getHttpServer()).get('/api/does-not-exist').expect(404);
    expect(res.body).toMatchObject({
      error: { code: 'NOT_FOUND' },
      statusCode: 404,
      path: '/api/does-not-exist',
    });
  });

  it('applies security headers and CORS allow-list', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://localhost:3001');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3001');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    expect(allowed.headers['x-powered-by']).toBeUndefined();

    const denied = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://evil.example.com');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('serves Swagger JSON outside production', async () => {
    const res = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
    expect(res.body.info.title).toBe('MyShop API');
    expect(res.body.paths).toHaveProperty('/api/health');
  });
});
