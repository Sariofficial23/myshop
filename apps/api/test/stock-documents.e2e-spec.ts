import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  type CompanyFixture,
  createCompanyFixture,
  createTestApp,
  prismaOf,
  randomImei,
} from './helpers.js';

type Agent = Awaited<ReturnType<typeof as>>;

/** Возвраты, перемещения, списания и инвентаризация — всё меняет остаток только документом. */
describe('Returns, transfers, write-offs, inventory (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let other: CompanyFixture;
  let owner: Agent;
  let seller: Agent;
  let warehouse: Agent;
  let outsider: Agent;
  let phone: string;
  let accessory: string;
  const imeis = Array.from({ length: 10 }, () => randomImei());

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    other = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
    seller = await as(app, fx.users.SELLER.telegramId);
    warehouse = await as(app, fx.users.WAREHOUSE.telegramId);
    outsider = await as(app, other.users.OWNER.telegramId);

    const p = await owner
      .post('/api/products')
      .send({
        name: 'Galaxy A56',
        serialType: 'IMEI',
        warrantyMonths: 12,
        variants: [{ salePrice: '5000000' }],
      })
      .expect(201);
    phone = p.body.variants[0].id;
    const a = await owner
      .post('/api/products')
      .send({ name: 'Charger', variants: [{ salePrice: '100' }] })
      .expect(201);
    accessory = a.body.variants[0].id;

    await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          { variantId: phone, quantity: 10, purchasePrice: '4000000', serialNumbers: imeis },
          { variantId: accessory, quantity: 50, purchasePrice: '60' },
        ],
      })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  const stockOf = async (variantId: string, branchId: string) => {
    const row = await prismaOf(app).stockBalance.findUnique({
      where: { branchId_variantId: { branchId, variantId } },
    });
    return row?.quantity ?? 0;
  };
  const serial = (number: string) =>
    prismaOf(app).serialNumber.findFirstOrThrow({ where: { number } });

  describe('Returns', () => {
    let sale: {
      id: string;
      items: Array<{ id: string; variantId: string; quantity: number; total: string }>;
    };
    const phoneLine = () => sale.items.find((i) => i.variantId === phone)!;
    const accessoryLine = () => sale.items.find((i) => i.variantId === accessory)!;

    beforeAll(async () => {
      // 2 телефона + 3 зарядки со скидкой 0.01 → строка 299.99
      const res = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          items: [
            { variantId: phone, serialNumbers: [imeis[0], imeis[1]] },
            { variantId: accessory, quantity: 3, discount: '0.01' },
          ],
          payments: [{ method: 'CASH', amount: '10000299.99' }],
        })
        .expect(201);
      sale = res.body;
    });

    it('requires returns.create: a seller cannot return without the extra permission', async () => {
      const res = await seller
        .post('/api/returns')
        .send({
          saleId: sale.id,
          refundMethod: 'CASH',
          items: [{ saleItemId: phoneLine().id, serialNumbers: [imeis[0]] }],
        })
        .expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('partial return: stock back, IMEI IN_STOCK, proportional refund, sale PARTIALLY_RETURNED', async () => {
      const before = await stockOf(accessory, fx.branchA);
      const res = await owner
        .post('/api/returns')
        .send({
          saleId: sale.id,
          refundMethod: 'CARD',
          reason: 'Не подошёл',
          items: [
            { saleItemId: phoneLine().id, serialNumbers: [imeis[0]] },
            { saleItemId: accessoryLine().id, quantity: 1 },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        displayNumber: `ВЗ-${res.body.number}`,
        refundTotal: '5000100.00',
        costTotal: '4000060.00',
        refunds: [{ method: 'CARD', amount: '5000100.00' }],
      });
      expect(await stockOf(accessory, fx.branchA)).toBe(before + 1);
      expect((await serial(imeis[0])).status).toBe('IN_STOCK');
      expect((await serial(imeis[0])).warrantyEnd).toBeNull();

      const updated = await owner.get(`/api/sales/${sale.id}`).expect(200);
      expect(updated.body.status).toBe('PARTIALLY_RETURNED');
      expect(updated.body.returns).toHaveLength(1);

      const movements = await prismaOf(app).stockMovement.findMany({
        where: { returnId: res.body.id },
      });
      expect(movements.map((m) => m.type)).toEqual(['RETURN', 'RETURN']);
    });

    it('rejects returning an IMEI twice and more than was sold', async () => {
      const again = await owner
        .post('/api/returns')
        .send({
          saleId: sale.id,
          refundMethod: 'CASH',
          items: [{ saleItemId: phoneLine().id, serialNumbers: [imeis[0]] }],
        })
        .expect(404);
      expect(again.body.error.code).toBe('IMEI_NOT_FOUND');

      const tooMany = await owner
        .post('/api/returns')
        .send({
          saleId: sale.id,
          refundMethod: 'CASH',
          items: [{ saleItemId: accessoryLine().id, quantity: 3 }],
        })
        .expect(409);
      expect(tooMany.body.error).toMatchObject({
        code: 'RETURN_LIMIT_EXCEEDED',
        details: { available: 2 },
      });
    });

    it('parallel returns never exceed what was sold', async () => {
      const body = {
        saleId: sale.id,
        refundMethod: 'CASH',
        items: [{ saleItemId: accessoryLine().id, quantity: 2 }],
      };
      const results = await Promise.all([1, 2].map(() => owner.post('/api/returns').send(body)));
      expect(results.map((r) => r.status).toSorted()).toEqual([201, 409]);
    });

    it('full return: refunds add up to the sale total, sale RETURNED, returned IMEI can be sold again', async () => {
      await owner
        .post('/api/returns')
        .send({
          saleId: sale.id,
          refundMethod: 'CASH',
          items: [{ saleItemId: phoneLine().id, serialNumbers: [imeis[1]] }],
        })
        .expect(201);
      const final = await owner.get(`/api/sales/${sale.id}`).expect(200);
      expect(final.body.status).toBe('RETURNED');
      // Полностью возвращённая продажа не приносит ни выручки, ни прибыли
      expect(final.body.refundedTotal).toBe(final.body.total);
      expect(final.body.grossProfit).toBe('0.00');
      const returns = await owner.get(`/api/returns?saleId=${sale.id}`).expect(200);
      const refunded = returns.body.items.reduce(
        (sum: number, r: { refundTotal: string }) => sum + Math.round(Number(r.refundTotal) * 100),
        0,
      );
      expect(refunded).toBe(Math.round(Number(final.body.total) * 100));

      await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: phone, serialNumbers: [imeis[1]] }],
          payments: [{ method: 'CASH', amount: '5000000' }],
        })
        .expect(201);
    });

    it('a seller with the granted returns permission can return; other companies cannot see the sale', async () => {
      const res = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: accessory, quantity: 1 }],
          payments: [{ method: 'CASH', amount: '100' }],
        })
        .expect(201);
      const body = {
        saleId: res.body.id,
        refundMethod: 'CASH',
        items: [{ saleItemId: res.body.items[0].id }],
      };
      const foreign = await outsider.post('/api/returns').send(body).expect(404);
      expect(foreign.body.error.code).toBe('SALE_NOT_FOUND');

      await prismaOf(app).membership.updateMany({
        where: { companyId: fx.companyId, userId: fx.users.SELLER.userId },
        data: { extraPermissions: ['returns.create'] },
      });
      const ok = await seller.post('/api/returns').send(body).expect(201);
      // Продавец не видит себестоимость возврата
      expect(ok.body.costTotal).toBeUndefined();
    });
  });

  describe('Transfers', () => {
    it('moves stock and IMEI between branches at average cost', async () => {
      const aBefore = await stockOf(accessory, fx.branchA);
      const res = await warehouse
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchA,
          toBranchId: fx.branchB,
          items: [
            { variantId: phone, serialNumbers: [imeis[2], imeis[3]] },
            { variantId: accessory, quantity: 5 },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        displayNumber: `ПМ-${res.body.number}`,
        fromBranch: { id: fx.branchA },
        toBranch: { id: fx.branchB },
      });
      expect(await stockOf(accessory, fx.branchA)).toBe(aBefore - 5);
      expect(await stockOf(accessory, fx.branchB)).toBe(5);
      expect(await stockOf(phone, fx.branchB)).toBe(2);
      expect((await serial(imeis[2])).branchId).toBe(fx.branchB);

      const balanceB = await prismaOf(app).stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: fx.branchB, variantId: accessory } },
      });
      expect(balanceB.avgCost.toFixed(2)).toBe('60.00');
      const movements = await prismaOf(app).stockMovement.findMany({
        where: { transferId: res.body.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(movements.map((m) => `${m.type}:${m.quantity}`).toSorted()).toEqual(
        ['TRANSFER_IN:2', 'TRANSFER_IN:5', 'TRANSFER_OUT:-2', 'TRANSFER_OUT:-5'].toSorted(),
      );
    });

    it('rejects same branch, foreign IMEI and insufficient stock — nothing changes', async () => {
      const same = await owner
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchA,
          toBranchId: fx.branchA,
          items: [{ variantId: accessory, quantity: 1 }],
        })
        .expect(400);
      expect(same.body.error.code).toBe('SAME_BRANCH_TRANSFER');

      // imeis[2] уже в филиале B
      const aBefore = await stockOf(phone, fx.branchA);
      const wrong = await owner
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchA,
          toBranchId: fx.branchB,
          items: [{ variantId: phone, serialNumbers: [imeis[2]] }],
        })
        .expect(409);
      expect(wrong.body.error.code).toBe('SERIAL_NOT_IN_STOCK');
      expect(await stockOf(phone, fx.branchA)).toBe(aBefore);

      const tooMany = await owner
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchA,
          toBranchId: fx.branchB,
          items: [{ variantId: accessory, quantity: 100_000 }],
        })
        .expect(409);
      expect(tooMany.body.error.code).toBe('INSUFFICIENT_STOCK');
    });

    it('lists every company branch as a transfer target, even for single-branch staff', async () => {
      const res = await warehouse.get('/api/branches/transfer-targets').expect(200);
      expect(res.body.map((b: { id: string }) => b.id).toSorted()).toEqual(
        [fx.branchA, fx.branchB].toSorted(),
      );
      await seller.get('/api/branches/transfer-targets').expect(403);
    });

    it('checks branch access and permissions', async () => {
      const denied = await warehouse
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchB,
          toBranchId: fx.branchA,
          items: [{ variantId: accessory, quantity: 1 }],
        })
        .expect(403);
      expect(denied.body.error.code).toBe('BRANCH_ACCESS_DENIED');
      await seller
        .post('/api/transfers')
        .send({
          fromBranchId: fx.branchA,
          toBranchId: fx.branchB,
          items: [{ variantId: accessory, quantity: 1 }],
        })
        .expect(403);
      const foreign = await outsider
        .post('/api/transfers')
        .send({
          fromBranchId: other.branchA,
          toBranchId: fx.branchB,
          items: [{ variantId: accessory, quantity: 1 }],
        })
        .expect(404);
      expect(foreign.body.error.code).toBe('BRANCH_NOT_FOUND');
    });
  });

  describe('Write-offs', () => {
    it('writes off stock and IMEI; a sold IMEI cannot be written off', async () => {
      const before = await stockOf(accessory, fx.branchA);
      const res = await warehouse
        .post('/api/write-offs')
        .send({
          branchId: fx.branchA,
          reason: 'DEFECT',
          notes: 'Разбит экран',
          items: [
            { variantId: phone, serialNumbers: [imeis[4]] },
            { variantId: accessory, quantity: 2 },
          ],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        displayNumber: `СП-${res.body.number}`,
        reason: 'DEFECT',
        costTotal: '4000120.00',
      });
      expect(await stockOf(accessory, fx.branchA)).toBe(before - 2);
      expect((await serial(imeis[4])).status).toBe('WRITTEN_OFF');

      // imeis[1] продан повторно в тесте возвратов
      const sold = await owner
        .post('/api/write-offs')
        .send({
          branchId: fx.branchA,
          reason: 'LOSS',
          items: [{ variantId: phone, serialNumbers: [imeis[1]] }],
        })
        .expect(409);
      expect(sold.body.error.code).toBe('SERIAL_NOT_IN_STOCK');
      await seller
        .post('/api/write-offs')
        .send({ branchId: fx.branchA, reason: 'LOSS', items: [{ variantId: accessory }] })
        .expect(403);
    });
  });

  describe('Inventory', () => {
    it('draft shows differences; confirm brings stock to the counted amount and writes off missing IMEI', async () => {
      const expectedAccessory = await stockOf(accessory, fx.branchA);
      const inStockPhones = await prismaOf(app).serialNumber.findMany({
        where: { variantId: phone, branchId: fx.branchA, status: 'IN_STOCK' },
        orderBy: { number: 'asc' },
      });
      const counted = inStockPhones.slice(1).map((s) => s.number);
      const missing = inStockPhones[0]!.number;

      const draft = await warehouse
        .post('/api/inventories')
        .send({
          branchId: fx.branchA,
          items: [
            { variantId: accessory, quantity: expectedAccessory - 3 },
            { variantId: phone, serialNumbers: counted },
          ],
        })
        .expect(201);
      expect(draft.body).toMatchObject({
        status: 'DRAFT',
        displayNumber: `ИН-${draft.body.number}`,
      });
      const acc = draft.body.items.find((i: { variantId: string }) => i.variantId === accessory);
      expect(acc).toMatchObject({ expectedQuantity: expectedAccessory, difference: -3 });
      // Черновик остаток не меняет
      expect(await stockOf(accessory, fx.branchA)).toBe(expectedAccessory);

      const confirmed = await warehouse
        .post(`/api/inventories/${draft.body.id}/confirm`)
        .expect(201);
      expect(confirmed.body.status).toBe('CONFIRMED');
      expect(await stockOf(accessory, fx.branchA)).toBe(expectedAccessory - 3);
      expect(await stockOf(phone, fx.branchA)).toBe(counted.length);
      expect((await serial(missing)).status).toBe('WRITTEN_OFF');
      const phoneItem = confirmed.body.items.find(
        (i: { variantId: string }) => i.variantId === phone,
      );
      expect(phoneItem.missingSerials).toEqual([missing]);

      const movements = await prismaOf(app).stockMovement.findMany({
        where: { inventoryId: draft.body.id },
      });
      expect(movements.map((m) => m.type)).toEqual([
        'INVENTORY_ADJUSTMENT',
        'INVENTORY_ADJUSTMENT',
      ]);

      const twice = await warehouse.post(`/api/inventories/${draft.body.id}/confirm`).expect(409);
      expect(twice.body.error.code).toBe('DOCUMENT_NOT_DRAFT');
    });

    it('surplus keeps the average cost; a counted IMEI that is not in stock rolls everything back', async () => {
      const before = await stockOf(accessory, fx.branchA);
      const surplus = await owner
        .post('/api/inventories')
        .send({
          branchId: fx.branchA,
          confirm: true,
          items: [{ variantId: accessory, quantity: before + 4 }],
        })
        .expect(201);
      expect(surplus.body.status).toBe('CONFIRMED');
      const balance = await prismaOf(app).stockBalance.findUniqueOrThrow({
        where: { branchId_variantId: { branchId: fx.branchA, variantId: accessory } },
      });
      expect(balance.quantity).toBe(before + 4);
      expect(balance.avgCost.toFixed(2)).toBe('60.00');

      const draft = await owner
        .post('/api/inventories')
        .send({
          branchId: fx.branchA,
          items: [
            { variantId: accessory, quantity: 0 },
            { variantId: phone, serialNumbers: [imeis[2]] }, // этот IMEI в филиале B
          ],
        })
        .expect(201);
      const failed = await owner.post(`/api/inventories/${draft.body.id}/confirm`).expect(409);
      expect(failed.body.error.code).toBe('SERIAL_NOT_IN_STOCK');
      expect(await stockOf(accessory, fx.branchA)).toBe(before + 4);
      const still = await owner.get(`/api/inventories/${draft.body.id}`).expect(200);
      expect(still.body.status).toBe('DRAFT');

      // Исправили подсчёт в черновике и отменили
      await owner
        .put(`/api/inventories/${draft.body.id}`)
        .send({ items: [{ variantId: accessory, quantity: 1 }] })
        .expect(200);
      await owner.post(`/api/inventories/${draft.body.id}/cancel`).expect(201);
      await seller.get('/api/inventories').expect(403);
    });
  });

  it('stock history shows every document type', async () => {
    const res = await owner.get(`/api/stock/movements?variantId=${accessory}`).expect(200);
    const types = new Set(res.body.map((m: { type: string }) => m.type));
    for (const type of [
      'PURCHASE',
      'SALE',
      'RETURN',
      'TRANSFER_OUT',
      'WRITE_OFF',
      'INVENTORY_ADJUSTMENT',
    ]) {
      expect(types).toContain(type);
    }
  });
});
