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

async function createProduct(agent: Agent, body: Record<string, unknown>) {
  const res = await agent.post('/api/products').send(body).expect(201);
  return { productId: res.body.id as string, variantId: res.body.variants[0].id as string };
}

describe('Purchases & stock (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let other: CompanyFixture;
  let owner: Agent;
  let warehouse: Agent;
  let phone: { productId: string; variantId: string };
  let cable: { productId: string; variantId: string };

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    other = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
    warehouse = await as(app, fx.users.WAREHOUSE.telegramId);
    phone = await createProduct(owner, { name: 'iPhone 15', serialType: 'IMEI', minimumStock: 3 });
    cable = await createProduct(owner, { name: 'USB-C cable', minimumStock: 5 });
  });

  afterAll(async () => {
    await app?.close();
  });

  it('Purchase → Stock: draft does not change stock; confirmation creates movements, balances, IMEI and cost', async () => {
    const imeis = [randomImei(), randomImei()];
    const supplier = await owner
      .post('/api/suppliers')
      .send({ name: `Supplier ${Date.now()}` })
      .expect(201);

    const draft = await warehouse
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        supplierId: supplier.body.id,
        documentNumber: 'НК-1',
        items: [
          {
            variantId: phone.variantId,
            quantity: 2,
            purchasePrice: '10000000',
            salePrice: '11990000',
            serialNumbers: imeis,
          },
          { variantId: cable.variantId, quantity: 10, purchasePrice: 25000.5 },
        ],
      })
      .expect(201);
    expect(draft.body).toMatchObject({
      status: 'DRAFT',
      total: '20250005.00',
      displayNumber: `ПР-${draft.body.number}`,
    });

    // Черновик остатки не меняет
    expect((await owner.get(`/api/stock?branchId=${fx.branchA}`).expect(200)).body).toHaveLength(0);

    const confirmed = await warehouse.post(`/api/purchases/${draft.body.id}/confirm`).expect(200);
    expect(confirmed.body).toMatchObject({
      status: 'CONFIRMED',
      confirmedBy: { id: fx.users.WAREHOUSE.userId },
    });

    const stock = await owner.get(`/api/stock?branchId=${fx.branchA}`).expect(200);
    const phoneRow = stock.body.find(
      (r: { variant: { id: string } }) => r.variant.id === phone.variantId,
    );
    const cableRow = stock.body.find(
      (r: { variant: { id: string } }) => r.variant.id === cable.variantId,
    );
    expect(phoneRow).toMatchObject({
      quantity: 2,
      avgCost: '10000000.00',
      stockValue: '20000000.00',
      low: true,
    });
    expect(cableRow).toMatchObject({ quantity: 10, avgCost: '25000.50', low: false });

    const movements = await owner
      .get(`/api/stock/movements?variantId=${phone.variantId}`)
      .expect(200);
    expect(movements.body).toHaveLength(1);
    expect(movements.body[0]).toMatchObject({
      type: 'PURCHASE',
      quantity: 2,
      balanceAfter: 2,
      unitCost: '10000000.00',
    });

    const imei = await owner.get(`/api/serial-numbers/${imeis[0]}`).expect(200);
    expect(imei.body).toMatchObject({ status: 'IN_STOCK', branch: { id: fx.branchA } });

    const product = await owner.get(`/api/products/${phone.productId}`).expect(200);
    expect(product.body.variants[0].salePrice).toBe('11990000.00');

    const audit = await prismaOf(app).auditLog.findMany({
      where: { entityId: draft.body.id, action: 'PURCHASE' },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ userId: fx.users.WAREHOUSE.userId, entity: 'Purchase' });
  });

  it('second purchase updates weighted average cost; documents are numbered sequentially', async () => {
    const first = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [{ variantId: cable.variantId, quantity: 10, purchasePrice: '30000' }],
      })
      .expect(201);
    expect(first.body.status).toBe('CONFIRMED');
    const second = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
      })
      .expect(201);
    expect(second.body.number).toBe(first.body.number + 1);

    const stock = await owner.get(`/api/stock?branchId=${fx.branchA}&q=USB-C`).expect(200);
    // (10 × 25000.50 + 10 × 30000) / 20 = 27500.25
    expect(stock.body[0]).toMatchObject({ quantity: 20, avgCost: '27500.25' });
  });

  it('a confirmed purchase cannot be confirmed, edited or cancelled again', async () => {
    const res = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
      })
      .expect(201);
    const again = await owner.post(`/api/purchases/${res.body.id}/confirm`).expect(409);
    expect(again.body.error.code).toBe('DOCUMENT_NOT_DRAFT');
    await owner.patch(`/api/purchases/${res.body.id}`).send({ notes: 'x' }).expect(409);
    await owner.post(`/api/purchases/${res.body.id}/cancel`).expect(409);
  });

  it('parallel confirmations of the same draft apply stock only once', async () => {
    const draft = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchB,
        items: [{ variantId: cable.variantId, quantity: 7, purchasePrice: '100' }],
      })
      .expect(201);
    const results = await Promise.all(
      Array.from({ length: 4 }, () => owner.post(`/api/purchases/${draft.body.id}/confirm`)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(3);
    const stock = await owner.get(`/api/stock?branchId=${fx.branchB}&q=USB-C`).expect(200);
    expect(stock.body[0].quantity).toBe(7);
  });

  it('IMEI rules: count must match quantity, format is checked, duplicates are rejected; nothing is applied on error', async () => {
    const mismatch = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 2,
            purchasePrice: '1',
            serialNumbers: [randomImei()],
          },
        ],
      })
      .expect(400);
    expect(mismatch.body.error.code).toBe('SERIAL_COUNT_MISMATCH');

    const invalid = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 1,
            purchasePrice: '1',
            serialNumbers: ['490154203237519'],
          },
        ],
      })
      .expect(400);
    expect(invalid.body.error.code).toBe('INVALID_IMEI');

    const same = randomImei();
    const dupInDoc = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 2,
            purchasePrice: '1',
            serialNumbers: [same, same],
          },
        ],
      })
      .expect(409);
    expect(dupInDoc.body.error.code).toBe('DUPLICATE_IMEI');

    const existing = await prismaOf(app).serialNumber.findFirstOrThrow({
      where: { companyId: fx.companyId },
    });
    const dupInDb = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: phone.variantId,
            quantity: 1,
            purchasePrice: '1',
            serialNumbers: [existing.number],
          },
        ],
      })
      .expect(409);
    expect(dupInDb.body.error).toMatchObject({
      code: 'DUPLICATE_IMEI',
      details: { numbers: [existing.number] },
    });

    const noSerials = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        confirm: true,
        items: [
          {
            variantId: cable.variantId,
            quantity: 1,
            purchasePrice: '1',
            serialNumbers: [randomImei()],
          },
        ],
      })
      .expect(400);
    expect(noSerials.body.error.code).toBe('SERIAL_NOT_ALLOWED');

    // Транзакции откатились: остаток телефона не изменился, лишних документов нет
    const stock = await owner.get(`/api/stock?branchId=${fx.branchA}&q=iPhone`).expect(200);
    expect(stock.body[0].quantity).toBe(2);
    const drafts = await owner.get('/api/purchases?status=DRAFT').expect(200);
    expect(drafts.body.items.every((p: { items: unknown[] }) => p.items.length > 0)).toBe(true);
  });

  it('draft can be edited and cancelled; cancelled purchase never touches stock', async () => {
    const draft = await owner
      .post('/api/purchases')
      .send({
        branchId: fx.branchA,
        items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '10' }],
      })
      .expect(201);
    const edited = await owner
      .patch(`/api/purchases/${draft.body.id}`)
      .send({
        items: [{ variantId: cable.variantId, quantity: 3, purchasePrice: '10' }],
        notes: 'исправлено',
      })
      .expect(200);
    expect(edited.body).toMatchObject({ total: '30.00', notes: 'исправлено' });
    expect(edited.body.items).toHaveLength(1);

    const before = (await owner.get(`/api/stock?branchId=${fx.branchA}&q=USB-C`).expect(200))
      .body[0].quantity;
    await owner.post(`/api/purchases/${draft.body.id}/cancel`).expect(200);
    const after = (await owner.get(`/api/stock?branchId=${fx.branchA}&q=USB-C`).expect(200)).body[0]
      .quantity;
    expect(after).toBe(before);
  });

  it('stock cannot be changed directly: there is no write endpoint for balances', async () => {
    const post = await owner
      .post('/api/stock')
      .send({ variantId: cable.variantId, quantity: 100 })
      .expect(404);
    expect(post.body.error.code).toBe('NOT_FOUND');
    await owner.patch('/api/stock').send({ variantId: cable.variantId, quantity: 100 }).expect(404);
  });

  it('DB refuses negative balances even if code tried', async () => {
    await expect(
      prismaOf(app).stockBalance.update({
        where: { branchId_variantId: { branchId: fx.branchA, variantId: cable.variantId } },
        data: { quantity: -1 },
      }),
    ).rejects.toThrow(/stock_balances_quantity_non_negative|constraint/i);
  });

  describe('access control', () => {
    it('seller cannot create purchases but can view stock of own branch only', async () => {
      const seller = await as(app, fx.users.SELLER.telegramId);
      await seller
        .post('/api/purchases')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
        })
        .expect(403);
      const stock = await seller.get('/api/stock').expect(200);
      expect(stock.body.every((r: { branch: { id: string } }) => r.branch.id === fx.branchA)).toBe(
        true,
      );
      const denied = await seller.get(`/api/stock?branchId=${fx.branchB}`).expect(403);
      expect(denied.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('warehouse cannot receive goods into a branch without access', async () => {
      const res = await warehouse
        .post('/api/purchases')
        .send({
          branchId: fx.branchB,
          items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
        })
        .expect(403);
      expect(res.body.error.code).toBe('BRANCH_ACCESS_DENIED');
    });

    it('company isolation: foreign variants, suppliers, branches and purchases are not accessible', async () => {
      const stranger = await as(app, other.users.OWNER.telegramId);
      const foreignVariant = await stranger
        .post('/api/purchases')
        .send({
          branchId: other.branchA,
          items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
        })
        .expect(404);
      expect(foreignVariant.body.error.code).toBe('VARIANT_NOT_FOUND');

      const foreignBranch = await stranger
        .post('/api/purchases')
        .send({
          branchId: fx.branchA,
          items: [{ variantId: cable.variantId, quantity: 1, purchasePrice: '1' }],
        })
        .expect(404);
      expect(foreignBranch.body.error.code).toBe('BRANCH_NOT_FOUND');

      const mine = await owner.get('/api/purchases').expect(200);
      const purchaseId = mine.body.items[0].id;
      const res = await stranger.get(`/api/purchases/${purchaseId}`).expect(404);
      expect(res.body.error.code).toBe('PURCHASE_NOT_FOUND');
      await stranger.post(`/api/purchases/${purchaseId}/confirm`).expect(404);
      expect((await stranger.get('/api/stock').expect(200)).body).toHaveLength(0);
      expect(
        (await stranger.get(`/api/stock/movements?variantId=${cable.variantId}`).expect(200)).body,
      ).toHaveLength(0);
    });
  });
});
