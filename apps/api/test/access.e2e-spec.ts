import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  type CompanyFixture,
  createCompanyFixture,
  createTestApp,
  nextTelegramId,
  prismaOf,
} from './helpers.js';

/** RBAC, изоляция компаний и доступ к филиалам — проверяются на backend. */
describe('Access control (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let other: CompanyFixture;

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    other = await createCompanyFixture(prismaOf(app));
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('RBAC', () => {
    it('seller cannot manage branches or view employees', async () => {
      const seller = await as(app, fx.users.SELLER.telegramId);
      const res = await seller.post('/api/branches').send({ name: 'Sergeli' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      await seller.get('/api/users').expect(403);
      await seller.patch('/api/companies/current').send({ name: 'Hacked' }).expect(403);
    });

    it('warehouse cannot view employees', async () => {
      const warehouse = await as(app, fx.users.WAREHOUSE.telegramId);
      const res = await warehouse.get('/api/users').expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('manager can view employees but cannot create branches or edit the company', async () => {
      const manager = await as(app, fx.users.MANAGER.telegramId);
      const res = await manager.get('/api/users').expect(200);
      expect(res.body).toHaveLength(4);
      await manager.post('/api/branches').send({ name: 'Sergeli' }).expect(403);
      await manager.patch('/api/companies/current').send({ name: 'X' }).expect(403);
    });

    it('owner manages company and branches; duplicate branch names are rejected', async () => {
      const owner = await as(app, fx.users.OWNER.telegramId);
      const name = `Techno House ${fx.companyId.slice(0, 8)}`;
      await owner.patch('/api/companies/current').send({ name, currency: 'usd' }).expect(200);
      const company = await owner.get('/api/companies/current').expect(200);
      expect(company.body).toMatchObject({ name, currency: 'USD' });

      await owner.post('/api/branches').send({ name: 'Sergeli' }).expect(201);
      const dup = await owner.post('/api/branches').send({ name: 'Sergeli' }).expect(409);
      expect(dup.body.error.code).toBe('DUPLICATE_BRANCH_NAME');
    });
  });

  describe('employees', () => {
    it('manager can add a seller but not a manager or owner', async () => {
      const manager = await as(app, fx.users.MANAGER.telegramId);
      const created = await manager
        .post('/api/users')
        .send({
          firstName: 'Дилшод',
          role: 'SELLER',
          branchIds: [fx.branchB],
          telegramId: nextTelegramId().toString(),
        })
        .expect(201);
      expect(created.body).toMatchObject({ role: 'SELLER', allBranches: false, isActive: true });
      expect(created.body.branches.map((b: { id: string }) => b.id)).toEqual([fx.branchB]);

      const res = await manager
        .post('/api/users')
        .send({ firstName: 'Boss', role: 'MANAGER' })
        .expect(403);
      expect(res.body.error.code).toBe('ROLE_ASSIGNMENT_FORBIDDEN');
      await manager.post('/api/users').send({ firstName: 'Boss', role: 'OWNER' }).expect(403);
      await manager
        .patch(`/api/users/${fx.users.OWNER.userId}`)
        .send({ isActive: false })
        .expect(403);
    });

    it('seller and warehouse must have at least one branch', async () => {
      const owner = await as(app, fx.users.OWNER.telegramId);
      const res = await owner
        .post('/api/users')
        .send({ firstName: 'NoBranch', role: 'SELLER' })
        .expect(400);
      expect(res.body.error.code).toBe('BRANCH_REQUIRED');
    });

    it('rejects adding the same Telegram user twice', async () => {
      const owner = await as(app, fx.users.OWNER.telegramId);
      const res = await owner
        .post('/api/users')
        .send({
          firstName: 'Dup',
          role: 'MANAGER',
          telegramId: fx.users.SELLER.telegramId.toString(),
        })
        .expect(409);
      expect(res.body.error.code).toBe('USER_ALREADY_MEMBER');
    });

    it('employee cannot change own role or status', async () => {
      const owner = await as(app, fx.users.OWNER.telegramId);
      const res = await owner
        .patch(`/api/users/${fx.users.OWNER.userId}`)
        .send({ role: 'SELLER' })
        .expect(403);
      expect(res.body.error.code).toBe('CANNOT_MODIFY_SELF');
    });

    it('role and permission changes apply to existing sessions immediately', async () => {
      const prisma = prismaOf(app);
      const telegramId = nextTelegramId();
      const owner = await as(app, fx.users.OWNER.telegramId);
      const created = await owner
        .post('/api/users')
        .send({
          firstName: 'Nodira',
          role: 'SELLER',
          branchIds: [fx.branchA],
          telegramId: telegramId.toString(),
        })
        .expect(201);
      const seller = await as(app, telegramId);
      expect((await seller.get('/api/auth/me').expect(200)).body.permissions).not.toContain(
        'returns.create',
      );

      // Продавцу выдают право на возвраты
      await owner
        .patch(`/api/users/${created.body.id}`)
        .send({ extraPermissions: ['returns.create'] })
        .expect(200);
      expect((await seller.get('/api/auth/me').expect(200)).body.permissions).toContain(
        'returns.create',
      );

      // Блокировка отзывает сессии
      await owner.patch(`/api/users/${created.body.id}`).send({ isActive: false }).expect(200);
      await seller.get('/api/auth/me').expect(401);
      expect(
        await prisma.session.count({ where: { userId: created.body.id, revokedAt: null } }),
      ).toBe(0);
    });
  });

  describe('branch access control', () => {
    it('restricted seller sees only assigned branches', async () => {
      const seller = await as(app, fx.users.SELLER.telegramId);
      const list = await seller.get('/api/branches').expect(200);
      expect(list.body.map((b: { id: string }) => b.id)).toEqual([fx.branchA]);

      await seller.get(`/api/branches/${fx.branchA}`).expect(200);
      const denied = await seller.get(`/api/branches/${fx.branchB}`).expect(403);
      expect(denied.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    });
  });

  describe('company isolation', () => {
    it("owner cannot read or modify another company's data", async () => {
      const owner = await as(app, fx.users.OWNER.telegramId);

      const branch = await owner.get(`/api/branches/${other.branchA}`).expect(404);
      expect(branch.body.error.code).toBe('BRANCH_NOT_FOUND');
      await owner.patch(`/api/branches/${other.branchA}`).send({ name: 'Mine now' }).expect(404);

      const user = await owner.get(`/api/users/${other.users.SELLER.userId}`).expect(404);
      expect(user.body.error.code).toBe('USER_NOT_FOUND');
      await owner
        .patch(`/api/users/${other.users.SELLER.userId}`)
        .send({ isActive: false })
        .expect(404);

      // Нельзя выдать доступ к филиалу чужой компании
      const res = await owner
        .post('/api/users')
        .send({ firstName: 'Spy', role: 'SELLER', branchIds: [other.branchA] })
        .expect(404);
      expect(res.body.error.code).toBe('BRANCH_NOT_FOUND');

      const users = await owner.get('/api/users').expect(200);
      const ids = users.body.map((u: { id: string }) => u.id);
      expect(ids).not.toContain(other.users.SELLER.userId);

      const branches = await owner.get('/api/branches').expect(200);
      expect(branches.body.map((b: { id: string }) => b.id)).not.toContain(other.branchA);
    });
  });
});
