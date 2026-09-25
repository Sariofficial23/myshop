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

/** Рассрочки, касса, гарантии, карточки клиентов и поставщиков. */
describe('Installments, cash, warranty (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let owner: Agent;
  let seller: Agent;
  let phone: string;
  let accessory: string;
  let supplierId: string;
  let customerId: string;
  const imeis = Array.from({ length: 6 }, () => randomImei());

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
    seller = await as(app, fx.users.SELLER.telegramId);

    const p = await owner
      .post('/api/products')
      .send({
        name: 'Pixel 9',
        serialType: 'IMEI',
        warrantyMonths: 12,
        variants: [{ salePrice: '5000000' }],
      })
      .expect(201);
    phone = p.body.variants[0].id;
    const a = await owner
      .post('/api/products')
      .send({ name: 'Cable', variants: [{ salePrice: '100' }] })
      .expect(201);
    accessory = a.body.variants[0].id;
    const s = await owner.post('/api/suppliers').send({ name: 'Tech Import' }).expect(201);
    supplierId = s.body.id;
    await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        supplierId,
        confirm: true,
        items: [
          { variantId: phone, quantity: 6, purchasePrice: '4000000', serialNumbers: imeis },
          { variantId: accessory, quantity: 20, purchasePrice: '50' },
        ],
      })
      .expect(201);
    const c = await seller
      .post('/api/customers')
      .send({ name: 'Нодира', phone: '+998 97 000 11 22' })
      .expect(201);
    customerId = c.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('Installments', () => {
    let installmentId: string;
    let saleId: string;
    let saleItemId: string;

    it('requires a customer and a down payment below the total', async () => {
      const noCustomer = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: phone, serialNumbers: [imeis[0]] }],
          payments: [],
          installment: { months: 4 },
        })
        .expect(400);
      expect(noCustomer.body.error.code).toBe('CUSTOMER_REQUIRED');

      const fullyPaid = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          customerId,
          items: [{ variantId: phone, serialNumbers: [imeis[0]] }],
          payments: [{ method: 'CASH', amount: '5000000' }],
          installment: { months: 4 },
        })
        .expect(400);
      expect(fullyPaid.body.error.code).toBe('PAYMENT_MISMATCH');
    });

    it('sells in installments: down payment now, the rest becomes the customer debt with a schedule', async () => {
      const res = await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          customerId,
          items: [{ variantId: phone, serialNumbers: [imeis[0]] }],
          payments: [{ method: 'CASH', amount: '1000000' }],
          installment: { months: 4, firstDueDate: '2099-01-15' },
        })
        .expect(201);
      expect(res.body).toMatchObject({
        paymentType: 'INSTALLMENT',
        total: '5000000.00',
        paidTotal: '1000000.00',
        installment: { total: '4000000.00', remaining: '4000000.00', months: 4, status: 'ACTIVE' },
      });
      saleId = res.body.id;
      saleItemId = res.body.items[0].id;
      installmentId = res.body.installment.id;

      const inst = await seller.get(`/api/installments/${installmentId}`).expect(200);
      expect(inst.body.monthlyAmount).toBe('1000000.00');
      expect(inst.body.schedule).toHaveLength(4);
      expect(inst.body.overdueAmount).toBe('0.00');
      expect(inst.body.nextDueDate.slice(0, 10)).toBe('2099-01-15');
    });

    it('accepts payments, rejects overpayment and never overpays under concurrency', async () => {
      const paid = await seller
        .post(`/api/installments/${installmentId}/payments`)
        .send({ method: 'CARD', amount: '1500000', branchId: fx.branchA })
        .expect(201);
      expect(paid.body.remaining).toBe('2500000.00');

      const over = await seller
        .post(`/api/installments/${installmentId}/payments`)
        .send({ method: 'CASH', amount: '3000000', branchId: fx.branchA })
        .expect(400);
      expect(over.body.error).toMatchObject({
        code: 'INSTALLMENT_OVERPAYMENT',
        details: { remaining: '2500000.00' },
      });

      const results = await Promise.all(
        [1, 2].map(() =>
          seller
            .post(`/api/installments/${installmentId}/payments`)
            .send({ method: 'CASH', amount: '2000000', branchId: fx.branchA }),
        ),
      );
      expect(results.map((r) => r.status).toSorted()).toEqual([201, 400]);
      const after = await seller.get(`/api/installments/${installmentId}`).expect(200);
      expect(after.body.remaining).toBe('500000.00');
      expect(after.body.payments).toHaveLength(2);
    });

    it('customer card shows purchases and debt; the list shows the debt too', async () => {
      const card = await seller.get(`/api/customers/${customerId}`).expect(200);
      expect(card.body.stats).toMatchObject({
        salesCount: 1,
        totalSpent: '5000000.00',
        debt: '500000.00',
      });
      expect(card.body.sales[0].displayNumber).toMatch(/^ПД-/);
      expect(card.body.installments[0]).toMatchObject({ remaining: '500000.00' });

      const list = await seller.get('/api/customers?q=Нодира').expect(200);
      expect(list.body[0].debt).toBe('500000.00');
    });

    it('a return first clears the remaining debt, only the rest is paid out; installment becomes PAID', async () => {
      const res = await owner
        .post('/api/returns')
        .send({
          saleId,
          refundMethod: 'CASH',
          items: [{ saleItemId, serialNumbers: [imeis[0]] }],
        })
        .expect(201);
      expect(res.body).toMatchObject({
        refundTotal: '5000000.00',
        debtReduction: '500000.00',
        refunds: [{ method: 'CASH', amount: '4500000.00' }],
      });
      const inst = await owner.get(`/api/installments/${installmentId}`).expect(200);
      expect(inst.body).toMatchObject({ status: 'PAID', remaining: '0.00' });
      const closed = await seller
        .post(`/api/installments/${installmentId}/payments`)
        .send({ method: 'CASH', amount: '1', branchId: fx.branchA })
        .expect(409);
      expect(closed.body.error.code).toBe('INSTALLMENT_CLOSED');
    });

    it('lists overdue installments', async () => {
      await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          customerId,
          items: [{ variantId: phone, serialNumbers: [imeis[1]] }],
          payments: [],
          installment: { months: 2, firstDueDate: '2026-01-10' },
        })
        .expect(201);
      const overdue = await owner.get('/api/installments?overdue=true').expect(200);
      expect(overdue.body.items).toHaveLength(1);
      expect(overdue.body.items[0].overdueAmount).toBe('5000000.00');
      expect(overdue.body.totals.overdue).toBe('5000000.00');
    });
  });

  describe('Cash register', () => {
    let cashFx: CompanyFixture;
    let cashOwner: Agent;
    let cable: string;

    beforeAll(async () => {
      cashFx = await createCompanyFixture(prismaOf(app));
      cashOwner = await as(app, cashFx.users.OWNER.telegramId);
      const a = await cashOwner
        .post('/api/products')
        .send({ name: 'Cable', variants: [{ salePrice: '100' }] })
        .expect(201);
      cable = a.body.variants[0].id;
      await cashOwner
        .post('/api/purchases')
        .send({
          branchId: cashFx.branchA,
          confirm: true,
          items: [{ variantId: cable, quantity: 10, purchasePrice: '50' }],
        })
        .expect(201);
    });

    it('cash balance follows cash sales, refunds, deposits, withdrawals and expenses', async () => {
      const sale = await cashOwner
        .post('/api/sales')
        .send({
          branchId: cashFx.branchA,
          items: [{ variantId: cable, quantity: 4 }],
          payments: [
            { method: 'CASH', amount: '300' },
            { method: 'CARD', amount: '100' },
          ],
        })
        .expect(201);
      for (const [type, amount] of [
        ['DEPOSIT', '1000'],
        ['WITHDRAWAL', '500'],
        ['EXPENSE', '100'],
      ] as const) {
        await cashOwner
          .post('/api/cash/operations')
          .send({ branchId: cashFx.branchA, type, amount, reason: type })
          .expect(201);
      }
      await cashOwner
        .post('/api/returns')
        .send({
          saleId: sale.body.id,
          refundMethod: 'CASH',
          items: [{ saleItemId: sale.body.items[0].id, quantity: 1 }],
        })
        .expect(201);

      const summary = await cashOwner
        .get(`/api/cash/summary?branchId=${cashFx.branchA}`)
        .expect(200);
      expect(summary.body).toMatchObject({
        balance: '600.00',
        sales: { CASH: '300.00', CARD: '100.00', TRANSFER: '0.00' },
        refunds: { CASH: '100.00' },
        deposits: '1000.00',
        withdrawals: '500.00',
        expenses: '100.00',
        revenue: '300.00',
      });
      const ops = await cashOwner
        .get(`/api/cash/operations?branchId=${cashFx.branchA}`)
        .expect(200);
      expect(ops.body).toHaveLength(3);
    });

    it('cannot take more cash than there is; sellers have no access to the register', async () => {
      const res = await cashOwner
        .post('/api/cash/operations')
        .send({ branchId: cashFx.branchA, type: 'WITHDRAWAL', amount: '601', reason: 'x' })
        .expect(409);
      expect(res.body.error).toMatchObject({
        code: 'CASH_INSUFFICIENT',
        details: { balance: '600.00' },
      });
      const cashSeller = await as(app, cashFx.users.SELLER.telegramId);
      await cashSeller.get(`/api/cash/summary?branchId=${cashFx.branchA}`).expect(403);
    });
  });

  describe('Warranty', () => {
    it('looks up a sold IMEI and handles a claim through its statuses', async () => {
      await seller
        .post('/api/sales')
        .send({
          branchId: fx.branchA,
          customerId,
          items: [{ variantId: phone, serialNumbers: [imeis[2]] }],
          payments: [{ method: 'CASH', amount: '5000000' }],
        })
        .expect(201);
      const lookup = await seller.get(`/api/warranty/${imeis[2]}`).expect(200);
      expect(lookup.body).toMatchObject({
        sold: true,
        inWarranty: true,
        sale: { customer: { id: customerId } },
        variant: { product: { name: 'Pixel 9' } },
      });

      const notSold = await seller
        .post('/api/warranty-claims')
        .send({ serialNumber: imeis[3], branchId: fx.branchA, problem: 'x' })
        .expect(409);
      expect(notSold.body.error.code).toBe('SERIAL_NOT_SOLD');

      const claim = await seller
        .post('/api/warranty-claims')
        .send({ serialNumber: imeis[2], branchId: fx.branchA, problem: 'Не заряжается' })
        .expect(201);
      expect(claim.body).toMatchObject({
        status: 'RECEIVED',
        inWarranty: true,
        displayNumber: `ГР-${claim.body.number}`,
        customer: { id: customerId },
      });
      const id = claim.body.id;
      for (const status of ['IN_REPAIR', 'READY', 'RETURNED']) {
        await seller.patch(`/api/warranty-claims/${id}`).send({ status }).expect(200);
      }
      const done = await seller
        .patch(`/api/warranty-claims/${id}`)
        .send({ status: 'IN_REPAIR' })
        .expect(409);
      expect(done.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      const final = await seller.get(`/api/warranty-claims/${id}`).expect(200);
      expect(final.body.closedAt).not.toBeNull();
    });

    it('marks claims after the warranty period as out of warranty', async () => {
      await prismaOf(app).serialNumber.updateMany({
        where: { number: imeis[2] },
        data: { warrantyEnd: new Date('2020-01-01') },
      });
      const lookup = await seller.get(`/api/warranty/${imeis[2]}`).expect(200);
      expect(lookup.body.inWarranty).toBe(false);
      expect(lookup.body.claims).toHaveLength(1);
      const claim = await seller
        .post('/api/warranty-claims')
        .send({ serialNumber: imeis[2], branchId: fx.branchA, problem: 'Разбит экран' })
        .expect(201);
      expect(claim.body.inWarranty).toBe(false);
    });
  });

  it('supplier card shows confirmed purchases', async () => {
    const res = await owner.get(`/api/suppliers/${supplierId}`).expect(200);
    expect(res.body.stats).toMatchObject({
      purchasesCount: 1,
      totalPurchased: '24001000.00',
    });
    expect(res.body.purchases[0].displayNumber).toMatch(/^ПР-/);
  });
});
