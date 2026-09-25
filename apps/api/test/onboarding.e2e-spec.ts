import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AuthResponse } from '@myshop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, initDataFor, nextTelegramId, prismaOf } from './helpers.js';

const ADMIN_TELEGRAM_ID = 777000111n; // PLATFORM_ADMIN_TELEGRAM_IDS в test/setup-env.ts

const bearer = (token: string) => `Bearer ${token}`;
const admin = (req: request.Test) =>
  req.set('x-telegram-init-data', initDataFor(ADMIN_TELEGRAM_ID));

/** Регистрация владельца, активация администратором платформы, сотрудники, подписка. */
describe('Onboarding, subscription and platform admin (e2e)', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());
  const suffix = Date.now().toString(36);
  const brand = `Apple Store ${suffix}`;
  const email = `owner-${suffix}@example.com`;
  let owner: AuthResponse;
  let companyId: string;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('owner registers with brand, email and password — the company waits for activation', async () => {
    const res = await http()
      .post('/api/auth/register')
      .send({ companyName: brand, email: email.toUpperCase(), password: 'secret123' })
      .expect(201);
    owner = res.body;
    companyId = owner.me.company.id;
    expect(owner.me).toMatchObject({
      role: 'OWNER',
      user: { email },
      company: { name: brand, subscription: { state: 'PENDING', paidUntil: null } },
    });
    // Профиль доступен, работа — нет
    await http().get('/api/auth/me').set('Authorization', bearer(owner.accessToken)).expect(200);
    const blocked = await http()
      .get('/api/products')
      .set('Authorization', bearer(owner.accessToken))
      .expect(403);
    expect(blocked.body.error.code).toBe('COMPANY_PENDING');
  });

  it('rejects a taken brand (any case), a taken email and a short password', async () => {
    const dupBrand = await http()
      .post('/api/auth/register')
      .send({
        companyName: `  ${brand.toLowerCase()} `,
        email: `x-${email}`,
        password: 'secret123',
      })
      .expect(409);
    expect(dupBrand.body.error.code).toBe('DUPLICATE_COMPANY_NAME');
    const dupEmail = await http()
      .post('/api/auth/register')
      .send({ companyName: `Other ${suffix}`, email, password: 'secret123' })
      .expect(409);
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    const short = await http()
      .post('/api/auth/register')
      .send({ companyName: `Short ${suffix}`, email: `s-${email}`, password: '123' })
      .expect(400);
    expect(short.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('owner logs in with email and password', async () => {
    const wrong = await http()
      .post('/api/auth/login')
      .send({ email, password: 'wrong-pass' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await http()
      .post('/api/auth/login')
      .send({ email: `nobody-${email}`, password: 'secret123' })
      .expect(401);
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
    const ok = await http()
      .post('/api/auth/login')
      .send({ email, password: 'secret123' })
      .expect(200);
    expect(ok.body.me.company.id).toBe(companyId);
  });

  it('only the platform admin (by signed Telegram initData) manages companies', async () => {
    const none = await http().get('/api/admin/companies').expect(403);
    expect(none.body.error.code).toBe('NOT_PLATFORM_ADMIN');
    await http()
      .get('/api/admin/companies')
      .set('x-telegram-init-data', initDataFor(nextTelegramId()))
      .expect(403);
    await http()
      .get('/api/admin/companies')
      .set('x-telegram-init-data', 'user=%7B%22id%22%3A777000111%7D&hash=forged')
      .expect(401);

    await admin(http().get('/api/admin/me')).expect(200);
    const list = await admin(http().get('/api/admin/companies?status=PENDING')).expect(200);
    const mine = list.body.find((c: { id: string }) => c.id === companyId);
    expect(mine).toMatchObject({ status: 'PENDING', owner: { email }, usersCount: 1 });
  });

  it('admin activates for a month — the owner can work', async () => {
    const res = await admin(http().post(`/api/admin/companies/${companyId}/extend`))
      .send({ months: 1 })
      .expect(200);
    expect(res.body).toMatchObject({ status: 'ACTIVE', state: 'ACTIVE' });
    const days = (new Date(res.body.paidUntil).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(32);

    // Второе продление добавляется к концу оплаченного периода
    const again = await admin(http().post(`/api/admin/companies/${companyId}/extend`))
      .send({ months: 2 })
      .expect(200);
    const total = (new Date(again.body.paidUntil).getTime() - Date.now()) / 86_400_000;
    expect(total).toBeGreaterThan(85);

    await http().get('/api/products').set('Authorization', bearer(owner.accessToken)).expect(200);
  });

  it('owner creates an employee with a login; the employee signs in with brand + login + password', async () => {
    const branches = await http()
      .get('/api/branches')
      .set('Authorization', bearer(owner.accessToken))
      .expect(200);
    const noCredentials = await http()
      .post('/api/users')
      .set('Authorization', bearer(owner.accessToken))
      .send({ firstName: 'Али', role: 'SELLER', branchIds: [branches.body[0].id] })
      .expect(400);
    expect(noCredentials.body.error.code).toBe('CREDENTIALS_REQUIRED');

    const seller = await http()
      .post('/api/users')
      .set('Authorization', bearer(owner.accessToken))
      .send({
        firstName: 'Али',
        role: 'SELLER',
        branchIds: [branches.body[0].id],
        login: 'Ali',
        password: 'seller123',
      })
      .expect(201);
    expect(seller.body).toMatchObject({ login: 'ali', hasPassword: true });

    const dup = await http()
      .post('/api/users')
      .set('Authorization', bearer(owner.accessToken))
      .send({
        firstName: 'Другой',
        role: 'SELLER',
        branchIds: [branches.body[0].id],
        login: 'ali',
        password: 'seller123',
      })
      .expect(409);
    expect(dup.body.error.code).toBe('LOGIN_TAKEN');

    const wrong = await http()
      .post('/api/auth/staff-login')
      .send({ companyName: brand, login: 'ali', password: 'nope-nope' })
      .expect(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    const ok = await http()
      .post('/api/auth/staff-login')
      .send({ companyName: brand.toUpperCase(), login: 'ALI', password: 'seller123' })
      .expect(200);
    expect(ok.body.me).toMatchObject({ role: 'SELLER', company: { id: companyId } });

    // Владелец сменил пароль — старые сессии сотрудника закрыты
    await http()
      .patch(`/api/users/${seller.body.id}`)
      .set('Authorization', bearer(owner.accessToken))
      .send({ password: 'newpass123' })
      .expect(200);
    await http().get('/api/auth/me').set('Authorization', bearer(ok.body.accessToken)).expect(401);
    await http()
      .post('/api/auth/staff-login')
      .send({ companyName: brand, login: 'ali', password: 'newpass123' })
      .expect(200);
  });

  it('expired subscription is read-only; blocked company cannot work at all', async () => {
    await prismaOf(app).company.update({
      where: { id: companyId },
      data: { paidUntil: new Date(Date.now() - 60_000) },
    });
    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', bearer(owner.accessToken))
      .expect(200);
    expect(me.body.company.subscription.state).toBe('EXPIRED');
    await http().get('/api/products').set('Authorization', bearer(owner.accessToken)).expect(200);
    const write = await http()
      .post('/api/products')
      .set('Authorization', bearer(owner.accessToken))
      .send({ name: 'X', variants: [{}] })
      .expect(402);
    expect(write.body.error.code).toBe('SUBSCRIPTION_EXPIRED');

    await admin(http().post(`/api/admin/companies/${companyId}/block`)).expect(200);
    const blocked = await http()
      .get('/api/products')
      .set('Authorization', bearer(owner.accessToken))
      .expect(403);
    expect(blocked.body.error.code).toBe('COMPANY_BLOCKED');

    await admin(http().post(`/api/admin/companies/${companyId}/unblock`)).expect(200);
    await admin(http().post(`/api/admin/companies/${companyId}/extend`))
      .send({ months: 1 })
      .expect(200);
    await http()
      .post('/api/products')
      .set('Authorization', bearer(owner.accessToken))
      .send({ name: 'Works again', variants: [{}] })
      .expect(201);
  });

  it('password login inside Telegram links the account: next time Telegram signs in directly', async () => {
    const telegramId = nextTelegramId();
    await http()
      .post('/api/auth/login')
      .send({ email, password: 'secret123', initData: initDataFor(telegramId) })
      .expect(200);
    const auto = await http()
      .post('/api/auth/telegram')
      .send({ initData: initDataFor(telegramId) })
      .expect(200);
    expect(auto.body.me.company.id).toBe(companyId);
  });
});
