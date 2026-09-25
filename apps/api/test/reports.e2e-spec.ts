import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  type CompanyFixture,
  createCompanyFixture,
  createTestApp,
  prismaOf,
} from './helpers.js';

type Agent = Awaited<ReturnType<typeof as>>;

describe('Sales report (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let owner: Agent;
  let seller: Agent;

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
    seller = await as(app, fx.users.SELLER.telegramId);
    const p = await owner
      .post('/api/products')
      .send({ name: 'Charger', variants: [{ salePrice: '100' }] })
      .expect(201);
    const variantId = p.body.variants[0].id;
    await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [{ variantId, quantity: 10, purchasePrice: '50' }],
      })
      .expect(201);
    const first = await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId, quantity: 3 }],
        payments: [{ method: 'CASH', amount: '300' }],
      })
      .expect(201);
    await seller
      .post('/api/sales')
      .send({
        branchId: fx.branchA,
        items: [{ variantId, quantity: 1, discount: '10' }],
        payments: [{ method: 'CARD', amount: '90' }],
      })
      .expect(201);
    await owner
      .post('/api/returns')
      .send({
        saleId: first.body.id,
        refundMethod: 'CASH',
        items: [{ saleItemId: first.body.items[0].id, quantity: 1 }],
      })
      .expect(201);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('today: what was sold, for how much, how it was paid, net of returns', async () => {
    const res = await owner.get('/api/reports/sales').expect(200);
    expect(res.body).toMatchObject({
      salesCount: 2,
      itemsSold: 4,
      revenue: '390.00',
      discount: '10.00',
      returnsCount: 1,
      returns: '100.00',
      netRevenue: '290.00',
      averageCheck: '195.00',
      // 290 выручки − (200 себестоимость продаж − 50 себестоимость возврата)
      grossProfit: '140.00',
      money: { CASH: '200.00', CARD: '90.00', TRANSFER: '0.00' },
      items: [{ product: 'Charger', quantity: 4, amount: '390.00', profit: '190.00' }],
      sellers: [{ id: fx.users.SELLER.userId, salesCount: 2, revenue: '390.00' }],
    });
  });

  it('sellers see sales but not profit; other days are empty', async () => {
    const res = await seller.get('/api/reports/sales').expect(200);
    expect(res.body.revenue).toBe('390.00');
    expect(res.body.grossProfit).toBeUndefined();
    expect(res.body.items[0].profit).toBeUndefined();

    const past = await owner.get('/api/reports/sales?from=2020-01-01&to=2020-01-31').expect(200);
    expect(past.body).toMatchObject({ salesCount: 0, revenue: '0.00', items: [] });
  });
});
