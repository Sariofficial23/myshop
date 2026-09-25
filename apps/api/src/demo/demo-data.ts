/**
 * Демо-документы для компании "Demo Electronics": приходы с IMEI и серийными номерами.
 * Работает через те же сервисы, что и REST API — остатки, движения, себестоимость и
 * журнал аудита создаются по тем же правилам, что и у реального пользователя.
 *
 *   pnpm db:seed && pnpm build && pnpm demo:data
 *
 * Идемпотентно: если у демо-компании уже есть приходы, скрипт ничего не делает.
 * Продажи добавятся на этапе 5.
 */
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { resolvePermissions, type SerialType } from '@myshop/shared';
import { AppModule } from '../app.module.js';
import type { AuthContext } from '../auth/auth-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PurchasesService } from '../purchases/purchases.service.js';
import { SuppliersService } from '../suppliers/suppliers.js';
import { demoImei } from './demo-imei.js';

const DEMO_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

function serials(type: SerialType | null, prefix: string, count: number, start: number): string[] {
  if (!type) return [];
  return Array.from({ length: count }, (_, i) =>
    type === 'IMEI' ? demoImei(start + i) : `${prefix}${String(start + i).padStart(6, '0')}`,
  );
}

async function main(): Promise<void> {
  const logger = new Logger('DemoData');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const prisma = app.get(PrismaService);
    const purchases = app.get(PurchasesService);
    const suppliers = app.get(SuppliersService);

    const owner = await prisma.membership.findFirst({
      where: { companyId: DEMO_COMPANY_ID, role: 'OWNER', isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!owner) throw new Error('Demo company not found — run `pnpm db:seed` first');
    if (await prisma.purchase.count({ where: { companyId: DEMO_COMPANY_ID } })) {
      logger.log('Demo purchases already exist — nothing to do');
      return;
    }

    const ctx: AuthContext = {
      sessionId: 'demo-data',
      userId: owner.userId,
      membershipId: owner.id,
      companyId: DEMO_COMPANY_ID,
      role: owner.role,
      permissions: new Set(resolvePermissions(owner.role)),
      allBranches: true,
      branchIds: [],
      userAgent: 'demo-data script',
    };

    const branch = await prisma.branch.findFirstOrThrow({
      where: { companyId: DEMO_COMPANY_ID, name: 'Main Store' },
    });
    const variants = await prisma.productVariant.findMany({
      where: { companyId: DEMO_COMPANY_ID },
      include: { product: true },
    });
    const bySku = new Map(variants.map((v) => [v.sku, v]));
    const supplier =
      (await prisma.supplier.findFirst({
        where: { companyId: DEMO_COMPANY_ID, name: 'Techno Distribution' },
      })) ??
      (await suppliers.create(ctx, {
        name: 'Techno Distribution',
        phone: '+998712000000',
        contact: 'Азиз',
      }));

    // [sku, количество, цена закупки] — две поставки, чтобы была средневзвешенная себестоимость
    const deliveries: Array<Array<[string, number, string]>> = [
      [
        ['IPH15-128-BLK', 5, '10300000'],
        ['SM-A566-256-GR', 4, '4600000'],
        ['RN14-256-BLK', 6, '2700000'],
        ['LG-55UR78', 2, '5900000'],
        ['APD4-WHT', 10, '1750000'],
      ],
      [
        ['IPH15-128-BLK', 3, '10100000'],
        ['RN14-256-BLK', 4, '2650000'],
        ['APD4-WHT', 5, '1700000'],
      ],
    ];

    let serialIndex = 1;
    for (const [n, lines] of deliveries.entries()) {
      const purchase = await purchases.create(ctx, {
        branchId: branch.id,
        supplierId: supplier.id,
        documentNumber: `TD-${2026_0 + n + 1}`,
        confirm: true,
        items: lines.map(([sku, quantity, purchasePrice]) => {
          const variant = bySku.get(sku);
          if (!variant) throw new Error(`Variant ${sku} not found — run \`pnpm db:seed\``);
          const numbers = serials(
            variant.product.serialType,
            sku.slice(0, 3),
            quantity,
            serialIndex,
          );
          serialIndex += numbers.length;
          return { variantId: variant.id, quantity, purchasePrice, serialNumbers: numbers };
        }),
      });
      logger.log(`✔ ${purchase.displayNumber}: ${lines.length} позиций, сумма ${purchase.total}`);
    }
  } finally {
    await app.close();
  }
}

await main();
