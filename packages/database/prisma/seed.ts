/**
 * Демо-данные MyShop. Скрипт идемпотентен — его можно запускать повторно.
 *
 * ЭТАП 1: компания "Demo Electronics", филиал "Main Store".
 * ЭТАП 2: сотрудники Owner / Manager / Seller / Warehouse.
 * ЭТАП 3: категории, бренды и товары из ТЗ (iPhone 15, Galaxy A56, Redmi Note, LG TV 55, AirPods).
 *
 * Демо-сотрудники имеют условные Telegram ID (900000001…900000004) — ими можно
 * войти через dev-login (только локально). Чтобы стать владельцем демо-компании
 * под своим Telegram-аккаунтом, укажите SEED_OWNER_TELEGRAM_ID.
 *
 * Следующие этапы добавят демонстрационные приходы/продажи — только через
 * документы со StockMovement (остатки и IMEI появятся с приходом).
 */
import { createPrismaClient } from '../src/client.js';
import { loadDatabaseEnv } from '../src/env.js';
import type { ProductUnit, Role, SerialType } from '../src/generated/prisma/client.js';

export const DEMO_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

const DEMO_USERS: Array<{ telegramId: bigint; firstName: string; role: Role }> = [
  { telegramId: 900000001n, firstName: 'Owner', role: 'OWNER' },
  { telegramId: 900000002n, firstName: 'Manager', role: 'MANAGER' },
  { telegramId: 900000003n, firstName: 'Seller', role: 'SELLER' },
  { telegramId: 900000004n, firstName: 'Warehouse', role: 'WAREHOUSE' },
];

interface DemoProduct {
  name: string;
  sku: string;
  category: string;
  brand: string;
  serialType: SerialType | null;
  warrantyMonths: number;
  minimumStock: number;
  unit?: ProductUnit;
  variant: {
    sku: string;
    name: string;
    model?: string;
    color?: string;
    memory?: string;
    storage?: string;
    attributes?: Record<string, string>;
    salePrice: string;
    barcode: string;
  };
}

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    name: 'iPhone 15',
    sku: 'IPH15',
    category: 'Смартфоны',
    brand: 'Apple',
    serialType: 'IMEI',
    warrantyMonths: 12,
    minimumStock: 3,
    variant: {
      sku: 'IPH15-128-BLK',
      name: '128GB Black',
      color: 'Black',
      storage: '128GB',
      salePrice: '11990000',
      barcode: '0195949036323',
    },
  },
  {
    name: 'Samsung Galaxy A56',
    sku: 'SM-A566',
    category: 'Смартфоны',
    brand: 'Samsung',
    serialType: 'IMEI',
    warrantyMonths: 12,
    minimumStock: 3,
    variant: {
      sku: 'SM-A566-256-GR',
      name: '8/256GB Graphite',
      color: 'Graphite',
      memory: '8GB',
      storage: '256GB',
      salePrice: '5490000',
      barcode: '8806095860071',
    },
  },
  {
    name: 'Redmi Note 14',
    sku: 'RN14',
    category: 'Смартфоны',
    brand: 'Xiaomi',
    serialType: 'IMEI',
    warrantyMonths: 12,
    minimumStock: 3,
    variant: {
      sku: 'RN14-256-BLK',
      name: '8/256GB Midnight Black',
      color: 'Midnight Black',
      memory: '8GB',
      storage: '256GB',
      salePrice: '3290000',
      barcode: '6941812791335',
    },
  },
  {
    name: 'LG TV 55" 4K UHD',
    sku: 'LG-TV55',
    category: 'Телевизоры',
    brand: 'LG',
    serialType: 'SERIAL',
    warrantyMonths: 24,
    minimumStock: 2,
    variant: {
      sku: 'LG-55UR78',
      name: '55UR78006LK',
      model: '55UR78006LK',
      attributes: { diagonal: '55"', resolution: '4K UHD' },
      salePrice: '6990000',
      barcode: '8806091983392',
    },
  },
  {
    name: 'AirPods 4',
    sku: 'APD4',
    category: 'Аксессуары',
    brand: 'Apple',
    serialType: 'SERIAL',
    warrantyMonths: 12,
    minimumStock: 5,
    variant: {
      sku: 'APD4-WHT',
      name: 'White',
      color: 'White',
      salePrice: '2190000',
      barcode: '0195949475559',
    },
  },
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

async function seedCatalog(companyId: string): Promise<void> {
  const categories = new Map<string, string>();
  const brands = new Map<string, string>();
  for (const product of DEMO_PRODUCTS) {
    if (!categories.has(product.category)) {
      const category = await prisma.category.upsert({
        where: { companyId_name: { companyId, name: product.category } },
        update: {},
        create: { companyId, name: product.category },
      });
      categories.set(product.category, category.id);
    }
    if (!brands.has(product.brand)) {
      const brand = await prisma.brand.upsert({
        where: { companyId_name: { companyId, name: product.brand } },
        update: {},
        create: { companyId, name: product.brand },
      });
      brands.set(product.brand, brand.id);
    }

    const created = await prisma.product.upsert({
      where: { companyId_sku: { companyId, sku: product.sku } },
      update: {},
      create: {
        companyId,
        name: product.name,
        sku: product.sku,
        categoryId: categories.get(product.category),
        brandId: brands.get(product.brand),
        unit: product.unit ?? 'PCS',
        serialType: product.serialType,
        warrantyMonths: product.warrantyMonths,
        minimumStock: product.minimumStock,
      },
    });
    const { barcode, ...variant } = product.variant;
    const createdVariant = await prisma.productVariant.upsert({
      where: { companyId_sku: { companyId, sku: variant.sku } },
      update: {},
      create: {
        companyId,
        productId: created.id,
        ...variant,
        attributes: variant.attributes ?? {},
      },
    });
    await prisma.barcode.upsert({
      where: { companyId_code: { companyId, code: barcode } },
      update: {},
      create: { companyId, variantId: createdVariant.id, code: barcode },
    });
    console.log(`  ✔ ${product.name} ${variant.name} (${variant.sku})`);
  }
}

async function main(): Promise<void> {
  const company = await prisma.company.upsert({
    where: { id: DEMO_COMPANY_ID },
    // Ключ названия нужен для входа сотрудников по названию компании
    update: { nameKey: 'demo electronics' },
    create: {
      id: DEMO_COMPANY_ID,
      name: 'Demo Electronics',
      nameKey: 'demo electronics',
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

  await seedCatalog(company.id);

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
