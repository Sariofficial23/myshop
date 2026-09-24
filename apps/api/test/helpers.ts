import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { AuthResponse, Role } from '@myshop/shared';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { signTelegramInitData } from '../src/auth/telegram-init-data.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

export const TEST_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

/** Приложение с той же конфигурацией, что в production (тестовые секреты — test/setup-env.ts). */
export async function createTestApp(): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

let telegramIdSeq = BigInt(Date.now()) * 1000n;
export function nextTelegramId(): bigint {
  telegramIdSeq += 1n;
  return telegramIdSeq;
}

export function initDataFor(
  telegramId: bigint,
  { firstName = 'Test', botToken = TEST_BOT_TOKEN, authDate = new Date() } = {},
): string {
  return signTelegramInitData(
    {
      auth_date: String(Math.floor(authDate.getTime() / 1000)),
      query_id: 'AAE' + telegramId.toString(),
      user: JSON.stringify({ id: Number(telegramId), first_name: firstName, language_code: 'ru' }),
    },
    botToken,
  );
}

export interface CompanyFixture {
  companyId: string;
  branchA: string;
  branchB: string;
  users: Record<Role, { userId: string; telegramId: bigint }>;
}

/**
 * Отдельная компания для каждого теста: 2 филиала и сотрудники всех ролей.
 * SELLER и WAREHOUSE имеют доступ только к филиалу A.
 */
export async function createCompanyFixture(prisma: PrismaService): Promise<CompanyFixture> {
  const company = await prisma.company.create({ data: { name: `Test ${randomUUID()}` } });
  const branchA = await prisma.branch.create({
    data: { companyId: company.id, name: 'Chilanzar' },
  });
  const branchB = await prisma.branch.create({
    data: { companyId: company.id, name: 'Yunusabad' },
  });

  const users = {} as CompanyFixture['users'];
  for (const role of ['OWNER', 'MANAGER', 'SELLER', 'WAREHOUSE'] as const) {
    const telegramId = nextTelegramId();
    const allBranches = role === 'OWNER' || role === 'MANAGER';
    const user = await prisma.user.create({ data: { telegramId, firstName: role } });
    await prisma.membership.create({
      data: {
        companyId: company.id,
        userId: user.id,
        role,
        allBranches,
        branches: allBranches ? undefined : { create: [{ branchId: branchA.id }] },
      },
    });
    users[role] = { userId: user.id, telegramId };
  }
  return { companyId: company.id, branchA: branchA.id, branchB: branchB.id, users };
}

export async function login(
  app: NestExpressApplication,
  telegramId: bigint,
): Promise<AuthResponse> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/telegram')
    .send({ initData: initDataFor(telegramId) })
    .expect(200);
  return res.body as AuthResponse;
}

/** Supertest-агент с Bearer-токеном сотрудника. */
export async function as(app: NestExpressApplication, telegramId: bigint) {
  const { accessToken } = await login(app, telegramId);
  const server = app.getHttpServer();
  const auth = (req: request.Test) => req.set('Authorization', `Bearer ${accessToken}`);
  return {
    token: accessToken,
    get: (url: string) => auth(request(server).get(url)),
    post: (url: string) => auth(request(server).post(url)),
    patch: (url: string) => auth(request(server).patch(url)),
  };
}

export function prismaOf(app: NestExpressApplication): PrismaService {
  return app.get(PrismaService);
}
