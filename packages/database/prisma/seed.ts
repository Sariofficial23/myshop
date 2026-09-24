/**
 * Демо-данные MyShop. Скрипт идемпотентен — его можно запускать повторно.
 *
 * ЭТАП 1: компания "Demo Electronics" и филиал "Main Store".
 * Следующие этапы добавят пользователей (Owner, Manager, Seller, Warehouse),
 * товары (iPhone 15 128GB Black, Samsung Galaxy A56, Redmi Note, LG TV 55, AirPods)
 * и демонстрационные приходы/продажи — только через документы со StockMovement.
 */
import { createPrismaClient } from '../src/client.js';
import { loadDatabaseEnv } from '../src/env.js';

export const DEMO_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

loadDatabaseEnv();
const prisma = createPrismaClient(process.env.DATABASE_URL ?? '');

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
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
