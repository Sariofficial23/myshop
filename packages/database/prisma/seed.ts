/**
 * Демо-данные MyShop. Скрипт идемпотентен — его можно запускать повторно.
 *
 * ЭТАП 1: компания "Demo Electronics", филиал "Main Store".
 * ЭТАП 2: сотрудники Owner / Manager / Seller / Warehouse.
 *
 * Демо-сотрудники имеют условные Telegram ID (900000001…900000004) — ими можно
 * войти через dev-login (только локально). Чтобы стать владельцем демо-компании
 * под своим Telegram-аккаунтом, укажите SEED_OWNER_TELEGRAM_ID.
 *
 * Следующие этапы добавят товары и демонстрационные приходы/продажи —
 * только через документы со StockMovement.
 */
import { createPrismaClient } from '../src/client.js';
import { loadDatabaseEnv } from '../src/env.js';
import type { Role } from '../src/generated/prisma/client.js';

export const DEMO_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const DEMO_USERS: Array<{ telegramId: bigint; firstName: string; role: Role }> = [
  { telegramId: 900000001n, firstName: 'Owner', role: 'OWNER' },
  { telegramId: 900000002n, firstName: 'Manager', role: 'MANAGER' },
  { telegramId: 900000003n, firstName: 'Seller', role: 'SELLER' },
  { telegramId: 900000004n, firstName: 'Warehouse', role: 'WAREHOUSE' },
];

loadDatabaseEnv();
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

async function upsertMember(
  companyId: string,
  branchId: string,
  data: { telegramId: bigint; firstName: string; role: Role },
): Promise<void> {
  const user = await prisma.user.upsert({
    where: { telegramId: data.telegramId },
    update: {},
    create: { telegramId: data.telegramId, firstName: data.firstName, languageCode: 'ru' },
  });
  const allBranches = data.role === 'OWNER' || data.role === 'MANAGER';
  await prisma.membership.upsert({
    where: { companyId_userId: { companyId, userId: user.id } },
    update: {},
    create: {
      companyId,
      userId: user.id,
      role: data.role,
      allBranches,
      branches: allBranches ? undefined : { create: [{ branchId }] },
    },
  });
  console.log(`  ✔ ${data.role.padEnd(9)} ${data.firstName} (telegramId ${data.telegramId})`);
}

async function main(): Promise<void> {
  const company = await prisma.company.upsert({
    where: { id: DEMO_COMPANY_ID },
    update: {},
    create: {
      id: DEMO_COMPANY_ID,
      name: 'Demo Electronics',
      currency: 'UZS',
      timezone: 'Asia/Tashkent',
    },
  });

  const branch = await prisma.branch.upsert({
    where: { companyId_name: { companyId: company.id, name: 'Main Store' } },
    update: {},
    create: { companyId: company.id, name: 'Main Store', address: 'Ташкент' },
  });

  console.log(`✔ Company "${company.name}" (${company.id}), branch "${branch.name}"`);

  for (const user of DEMO_USERS) {
    await upsertMember(company.id, branch.id, user);
  }

  const ownerTelegramId = process.env.SEED_OWNER_TELEGRAM_ID?.trim();
  if (ownerTelegramId) {
    if (!/^\d{1,20}$/.test(ownerTelegramId)) {
      throw new Error('SEED_OWNER_TELEGRAM_ID must be a numeric Telegram user id');
    }
    await upsertMember(company.id, branch.id, {
      telegramId: BigInt(ownerTelegramId),
      firstName: 'Владелец',
      role: 'OWNER',
    });
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
