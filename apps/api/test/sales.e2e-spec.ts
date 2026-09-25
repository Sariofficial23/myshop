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

describe('Sales (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let other: CompanyFixture;
  let owner: Agent;
  let seller: Agent;
  let phone: { productId: string; variantId: string };
  let phoneCase: { productId: string; variantId: string };
  const imeis = Array.from({ length: 6 }, () => randomImei());
  const imeiB = randomImei();

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    other = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
    seller = await as(app, fx.users.SELLER.telegramId);

    const p = await owner
      .post('/api/products')
      .send({
        name: 'iPhone 15',
        serialType: 'IMEI',
        warrantyMonths: 12,
        variants: [{ name: '128GB', salePrice: '12000000' }],
      })
      .expect(201);
    phone = { productId: p.body.id, variantId: p.body.variants[0].id };
    const c = await owner
      .post('/api/products')
      .send({ name: 'Case', variants: [{ salePrice: '100000' }] })
      .expect(201);
    phoneCase = { productId: c.body.id, variantId: c.body.variants[0].id };

    // Приход в филиал A (6 телефонов, 10 чехлов) и в B (1 телефон)
    await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 6,
            purchasePrice: '10000000',
            serialNumbers: imeis,
          },
          { variantId: phoneCase.variantId, quantity: 10, purchasePrice: '40000' },
        ],
      })
      .expect(201);
    await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchB,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 1,
            purchasePrice: '10000000',
            serialNumbers: [imeiB],
          },
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

  it('Purchase → Stock → Sale: stock decreases, IMEI becomes SOLD with warranty, payments and cost are recorded', async () => {
    const customer = await seller
      .post('/api/customers')
      .send({ name: 'Алишер', phone: '+998 90 123-45-67' })
      .expect(201);
    expect(customer.body.phone).toBe('+998901234567');

    const res = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        customerId: customer.body.id,
        items: [
          { variantId: phone.variantId, serialNumbers: [imeis[0]], discount: '500000' },
          { variantId: phoneCase.variantId, quantity: 2 },
        ],
        payments: [
          { method: 'CASH', amount: '10000000' },
          { method: 'CARD', amount: '1700000' },
        ],
      })
      .expect(201);

    expect(res.body).toMatchObject({
      status: 'COMPLETED',
      paymentType: 'MIXED',
      subtotal: '12200000.00',
      discountTotal: '500000.00',
      total: '11700000.00',
      paidTotal: '11700000.00',
      seller: { id: fx.users.SELLER.userId },
      customer: { id: customer.body.id },
      displayNumber: `ПД-${res.body.number}`,
    });
    // Продавец не видит себестоимость и прибыль
    expect(res.body.costTotal).toBeUndefined();
    expect(res.body.items[0].unitCost).toBeUndefined();
    expect(res.body.payments).toHaveLength(2);
    expect(res.body.items[0].serialNumbers[0].number).toBe(imeis[0]);

    expect(await stockOf(phone.variantId, fx.branchA)).toBe(5);
    expect(await stockOf(phoneCase.variantId, fx.branchA)).toBe(8);

    const imei = await owner.get(`/api/serial-numbers/${imeis[0]}`).expect(200);
    expect(imei.body).toMatchObject({ status: 'SOLD', sale: { id: res.body.id } });
    const unit = await prismaOf(app).serialNumber.findFirstOrThrow({ where: { number: imeis[0] } });
    expect(unit.warrantyStart).not.toBeNull();
    expect(unit.warrantyEnd!.getUTCFullYear()).toBe(unit.warrantyStart!.getUTCFullYear() + 1);

    // Владелец видит себестоимость и валовую прибыль: 11 700 000 − (10 000 000 + 2 × 40 000)
    const full = await owner.get(`/api/sales/${res.body.id}`).expect(200);
    expect(full.body).toMatchObject({ costTotal: '10080000.00', grossProfit: '1620000.00' });

    const movements = await owner
      .get(`/api/stock/movements?variantId=${phone.variantId}&branchId=${fx.branchA}`)
      .expect(200);
    expect(movements.body[0]).toMatchObject({
      type: 'SALE',
      quantity: -1,
      balanceAfter: 5,
      sale: { number: res.body.number },
    });

    const audit = await prismaOf(app).auditLog.count({
      where: { entityId: res.body.id, action: 'SALE' },
    });
    expect(audit).toBe(1);
  });

  it('an already sold IMEI cannot be sold again', async () => {
    const res = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phone.variantId, serialNumbers: [imeis[0]] }],
        payments: [{ method: 'CASH', amount: '12000000' }],
      })
      .expect(409);
    expect(res.body.error).toMatchObject({
      code: 'IMEI_ALREADY_SOLD',
      details: { numbers: [imeis[0]] },
    });
  });

  it('IMEI from another branch or unknown IMEI is rejected; nothing is written', async () => {
    const before = await prismaOf(app).sale.count({ where: { companyId: fx.companyId } });
    const res = await owner
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phone.variantId, serialNumbers: [imeis[1], imeiB] }],
        payments: [{ method: 'CASH', amount: '24000000' }],
      })
      .expect(404);
    expect(res.body.error).toMatchObject({ code: 'IMEI_NOT_FOUND', details: { numbers: [imeiB] } });
    await owner
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phone.variantId, serialNumbers: [randomImei()] }],
        payments: [{ method: 'CASH', amount: '12000000' }],
      })
      .expect(404);
    expect(await prismaOf(app).sale.count({ where: { companyId: fx.companyId } })).toBe(before);
    expect(await stockOf(phone.variantId, fx.branchA)).toBe(5);
    const unit = await prismaOf(app).serialNumber.findFirstOrThrow({ where: { number: imeis[1] } });
    expect(unit.status).toBe('IN_STOCK');
  });

  it('two parallel sales of the same IMEI: exactly one succeeds', async () => {
    const body = {
      branchId: fx.branchA,
      items: [{ variantId: phone.variantId, serialNumbers: [imeis[2]] }],
      payments: [{ method: 'CARD', amount: '12000000' }],
    };
    const results = await Promise.all(
      Array.from({ length: 3 }, () => owner.post('/api/sales').send(body)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(
      results
        .filter((r) => r.status === 409)
        .every(
          (r) =>
            r.body.error.code === 'IMEI_ALREADY_SOLD' || r.body.error.code === 'INSUFFICIENT_STOCK',
        ),
    ).toBe(true);
    expect(await stockOf(phone.variantId, fx.branchA)).toBe(4);
  });

  it('insufficient stock is rejected with INSUFFICIENT_STOCK', async () => {
    const res = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phoneCase.variantId, quantity: 999 }],
        payments: [{ method: 'CASH', amount: '99900000' }],
      })
      .expect(409);
    expect(res.body.error).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      details: { available: 8, requested: 999 },
    });
  });

  it('payments must equal the total', async () => {
    const res = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phoneCase.variantId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: '90000' }],
      })
      .expect(400);
    expect(res.body.error).toMatchObject({
      code: 'PAYMENT_MISMATCH',
      details: { total: '100000.00', paid: '90000.00' },
    });
  });

  it('seller cannot change the price, but can give a discount; discount cannot exceed the amount', async () => {
    const price = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phoneCase.variantId, quantity: 1, price: '1' }],
        payments: [{ method: 'CASH', amount: '1' }],
      })
      .expect(403);
    expect(price.body.error.code).toBe('PRICE_CHANGE_FORBIDDEN');

    const discount = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phoneCase.variantId, quantity: 1, discount: '100001' }],
        payments: [{ method: 'CASH', amount: '1' }],
      })
      .expect(400);
    expect(discount.body.error.code).toBe('DISCOUNT_TOO_LARGE');

    // Владелец может продать по другой цене
    await owner
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phoneCase.variantId, quantity: 1, price: '90000' }],
        payments: [{ method: 'TRANSFER', amount: '90000' }],
      })
      .expect(201);
  });

  it('IMEI product requires IMEI selection', async () => {
    const res = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: phone.variantId, quantity: 1 }],
        payments: [{ method: 'CASH', amount: '12000000' }],
      })
      .expect(400);
    expect(res.body.error.code).toBe('SERIAL_COUNT_MISMATCH');
  });

  it('lists IMEI in stock for the picker (only accessible branches)', async () => {
    const list = await seller.get(`/api/serial-numbers?variantId=${phone.variantId}`).expect(200);
    const numbers = list.body.map((s: { number: string }) => s.number);
    expect(numbers).toHaveLength(4);
    expect(numbers).not.toContain(imeiB);
    expect(numbers).not.toContain(imeis[0]);
  });

  describe('access control', () => {
    it('seller cannot sell in a branch without access; warehouse cannot sell at all', async () => {
      const res = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchB,
          items: [{ variantId: phone.variantId, serialNumbers: [imeiB] }],
          payments: [{ method: 'CASH', amount: '12000000' }],
        })
        .expect(403);
      expect(res.body.error.code).toBe('BRANCH_ACCESS_DENIED');
      const warehouse = await as(app, fx.users.WAREHOUSE.telegramId);
      await warehouse
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: phoneCase.variantId, quantity: 1 }],
          payments: [{ method: 'CASH', amount: '100000' }],
        })
        .expect(403);
    });

    it('company isolation: foreign sales, customers and variants are not accessible', async () => {
      const stranger = await as(app, other.users.OWNER.telegramId);
      const mine = await owner.get('/api/sales').expect(200);
      const saleId = mine.body.items[0].id;
      const res = await stranger.get(`/api/sales/${saleId}`).expect(404);
      expect(res.body.error.code).toBe('SALE_NOT_FOUND');
      expect((await stranger.get('/api/sales').expect(200)).body.total).toBe(0);
      expect((await stranger.get('/api/payments').expect(200)).body).toHaveLength(0);
      expect((await stranger.get('/api/customers').expect(200)).body).toHaveLength(0);

      const foreign = await stranger
        .post('/api/sales')
        .send({
          branchId: other.branchA,
          items: [{ variantId: phoneCase.variantId, quantity: 1 }],
          payments: [{ method: 'CASH', amount: '100000' }],
        })
        .expect(404);
      expect(foreign.body.error.code).toBe('VARIANT_NOT_FOUND');

      const customerId = (await owner.get('/api/customers').expect(200)).body[0].id;
      const foreignCustomer = await stranger
        .post('/api/sales')
        .send({
          branchId: other.branchA,
          customerId,
          items: [{ variantId: phoneCase.variantId, quantity: 1 }],
          payments: [{ method: 'CASH', amount: '1' }],
        })
        .expect(404);
      expect(foreignCustomer.body.error.code).toBe('CUSTOMER_NOT_FOUND');
    });

    it('customer phone is unique within a company', async () => {
      const res = await seller
        .post('/api/customers')
        .send({ name: 'Другой', phone: '+998901234567' })
        .expect(409);
      expect(res.body.error.code).toBe('DUPLICATE_CUSTOMER_PHONE');
      const found = await seller.get('/api/customers?q=1234567').expect(200);
      expect(found.body[0].name).toBe('Алишер');
    });
  });
});
