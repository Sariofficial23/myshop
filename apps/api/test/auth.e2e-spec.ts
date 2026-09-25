import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuthResponse } from '@myshop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type CompanyFixture,
  createCompanyFixture,
  createTestApp,
  initDataFor,
  login,
  nextTelegramId,
  prismaOf,
} from './helpers.js';

describe('Auth (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('POST /api/auth/telegram', () => {
    it('logs in with valid initData and returns user, company, role, permissions and branches', async () => {
      const res = await http()
        .post('/api/auth/telegram')
        .send({ initData: initDataFor(fx.users.SELLER.telegramId, { firstName: 'Алишер' }) })
        .expect(200);
      const body = res.body as AuthResponse;

      expect(body.accessToken).toBeTruthy();
      expect(body.refreshToken).toBeTruthy();
      expect(body.expiresIn).toBe(900);
      expect(body.me.company.id).toBe(fx.companyId);
      expect(body.me.role).toBe('SELLER');
      expect(body.me.permissions).toContain('sales.create');
      expect(body.me.permissions).not.toContain('returns.create');
      expect(body.me.allBranches).toBe(false);
      expect(body.me.branches.map((b) => b.id)).toEqual([fx.branchA]);
      // Профиль обновляется из Telegram
      expect(body.me.user.firstName).toBe('Алишер');
      expect(body.me.user.telegramId).toBe(fx.users.SELLER.telegramId.toString());
    });

    it('rejects initData signed with another bot token (forged telegram id)', async () => {
      const forged = initDataFor(fx.users.OWNER.telegramId, {
        botToken: '999:FORGED_TOKEN_abcdefghijklmnopqrstuvwxyz',
      });
      const res = await http().post('/api/auth/telegram').send({ initData: forged }).expect(401);
      expect(res.body.error.code).toBe('INVALID_INIT_DATA');
    });

    it('rejects expired initData', async () => {
      const old = initDataFor(fx.users.OWNER.telegramId, {
        authDate: new Date(Date.now() - 2 * 24 * 3600 * 1000),
      });
      const res = await http().post('/api/auth/telegram').send({ initData: old }).expect(401);
      expect(res.body.error.code).toBe('INIT_DATA_EXPIRED');
    });

    it('returns NO_MEMBERSHIP with telegramId for unknown users', async () => {
      const stranger = nextTelegramId();
      const res = await http()
        .post('/api/auth/telegram')
        .send({ initData: initDataFor(stranger) })
        .expect(403);
      expect(res.body.error.code).toBe('NO_MEMBERSHIP');
      expect(res.body.error.details).toEqual({ telegramId: stranger.toString() });
    });

    it('validates the request body', async () => {
      const res = await http().post('/api/auth/telegram').send({}).expect(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('protected endpoints', () => {
    it('require a valid bearer token', async () => {
      const noToken = await http().get('/api/auth/me').expect(401);
      expect(noToken.body.error.code).toBe('UNAUTHORIZED');
      await http().get('/api/auth/me').set('Authorization', 'Bearer garbage').expect(401);
    });

    it('GET /api/auth/me returns the current context', async () => {
      const { accessToken } = await login(app, fx.users.OWNER.telegramId);
      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.role).toBe('OWNER');
      expect(res.body.allBranches).toBe(true);
      expect(res.body.branches).toHaveLength(2);
    });
  });

  describe('sessions', () => {
    it('rotates refresh tokens; an old refresh token cannot be reused', async () => {
      const first = await login(app, fx.users.MANAGER.telegramId);
      const refreshed = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);
      expect(refreshed.body.refreshToken).not.toBe(first.refreshToken);
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(200);

      // Старая сессия отозвана — её access token больше не работает
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${first.accessToken}`)
        .expect(401);
      const reuse = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(401);
      expect(reuse.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('revokes all sessions when a rotated refresh token is reused later (token theft)', async () => {
      const prisma = prismaOf(app);
      const first = await login(app, fx.users.WAREHOUSE.telegramId);
      const second = await http()
        .post('/api/auth/refresh')
        .send({ refreshToken: first.refreshToken })
        .expect(200);

      // Имитируем повтор старого токена спустя минуту после ротации
      await prisma.session.updateMany({
        where: { userId: fx.users.WAREHOUSE.userId, replacedById: { not: null } },
        data: { revokedAt: new Date(Date.now() - 60_000) },
      });
      await http().post('/api/auth/refresh').send({ refreshToken: first.refreshToken }).expect(401);

      // Легитимная (новая) сессия тоже отозвана
      await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${second.body.accessToken}`)
        .expect(401);
    });

    it('logout revokes the session immediately', async () => {
      const { accessToken, refreshToken } = await login(app, fx.users.OWNER.telegramId);
      await http()
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(204);
      await http().get('/api/auth/me').set('Authorization', `Bearer ${accessToken}`).expect(401);
      await http().post('/api/auth/refresh').send({ refreshToken }).expect(401);
    });

    it('blocking an employee takes effect on the next request', async () => {
      const prisma = prismaOf(app);
      const telegramId = nextTelegramId();
      const user = await prisma.user.create({ data: { telegramId, firstName: 'Temp' } });
      const membership = await prisma.membership.create({
        data: {
          companyId: fx.companyId,
          userId: user.id,
          role: 'SELLER',
          branches: { create: [{ branchId: fx.branchA }] },
        },
      });
      const { accessToken } = await login(app, telegramId);

      await prisma.membership.update({ where: { id: membership.id }, data: { isActive: false } });
      const res = await http()
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
    });
  });

  describe('dev login', () => {
    it('logs in by telegram id when enabled (non-production only)', async () => {
      const res = await http()
        .post('/api/auth/dev-login')
        .send({ telegramId: fx.users.WAREHOUSE.telegramId.toString() })
        .expect(200);
      expect(res.body.me.role).toBe('WAREHOUSE');
    });
  });
});
