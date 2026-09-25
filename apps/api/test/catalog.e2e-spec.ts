import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  as,
  type CompanyFixture,
  createCompanyFixture,
  createTestApp,
  prismaOf,
} from './helpers.js';

const uniq = () => Math.random().toString(36).slice(2, 8).toUpperCase();

describe('Catalog (e2e)', () => {
  let app: NestExpressApplication;
  let fx: CompanyFixture;
  let other: CompanyFixture;
  let owner: Awaited<ReturnType<typeof as>>;

  beforeAll(async () => {
    app = await createTestApp();
    fx = await createCompanyFixture(prismaOf(app));
    other = await createCompanyFixture(prismaOf(app));
    owner = await as(app, fx.users.OWNER.telegramId);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('categories and brands', () => {
    it('creates, lists and rejects duplicates', async () => {
      const phones = await owner.post('/api/categories').send({ name: 'Смартфоны' }).expect(201);
      await owner
        .post('/api/categories')
        .send({ name: 'Apple phones', parentId: phones.body.id })
        .expect(201);
      const dup = await owner.post('/api/categories').send({ name: 'Смартфоны' }).expect(409);
      expect(dup.body.error.code).toBe('DUPLICATE_CATEGORY');

      await owner.post('/api/brands').send({ name: 'Apple' }).expect(201);
      const dupBrand = await owner.post('/api/brands').send({ name: 'Apple' }).expect(409);
      expect(dupBrand.body.error.code).toBe('DUPLICATE_BRAND');

      const list = await owner.get('/api/categories').expect(200);
      expect(list.body.map((c: { name: string }) => c.name)).toEqual(['Apple phones', 'Смартфоны']);
    });

    it('prevents category cycles', async () => {
      const a = await owner
        .post('/api/categories')
        .send({ name: `A ${uniq()}` })
        .expect(201);
      const b = await owner
        .post('/api/categories')
        .send({ name: `B ${uniq()}`, parentId: a.body.id })
        .expect(201);
      const res = await owner
        .patch(`/api/categories/${a.body.id}`)
        .send({ parentId: b.body.id })
        .expect(400);
      expect(res.body.error.code).toBe('CATEGORY_CYCLE');
    });
  });

  describe('products', () => {
    it('creates a product with variants and barcodes in one request', async () => {
      const category = await owner
        .post('/api/categories')
        .send({ name: `Phones ${uniq()}` })
        .expect(201);
      const brand = await owner
        .post('/api/brands')
        .send({ name: `Brand ${uniq()}` })
        .expect(201);
      const sku = `IPH15-${uniq()}`;

      const res = await owner
        .post('/api/products')
        .send({
          name: 'iPhone 15',
          sku,
          categoryId: category.body.id,
          brandId: brand.body.id,
          serialType: 'IMEI',
          warrantyMonths: 12,
          minimumStock: 2,
          variants: [
            {
              name: '128GB Black',
              storage: '128GB',
              color: 'Black',
              salePrice: '11990000',
              barcodes: [`19${uniq()}01`],
            },
            { name: '256GB Blue', storage: '256GB', color: 'Blue', salePrice: 13990000 },
          ],
        })
        .expect(201);

      expect(res.body).toMatchObject({
        name: 'iPhone 15',
        sku,
        serialType: 'IMEI',
        warrantyMonths: 12,
        unit: 'PCS',
        category: { id: category.body.id },
        brand: { id: brand.body.id },
      });
      expect(res.body.variants).toHaveLength(2);
      expect(res.body.variants[0]).toMatchObject({
        sku: `${sku}-1`,
        salePrice: '11990000.00',
        color: 'Black',
      });
      expect(res.body.variants[0].barcodes).toHaveLength(1);
      expect(res.body.variants[1]).toMatchObject({ sku: `${sku}-2`, salePrice: '13990000.00' });
    });

    it('creates a default variant and generates a SKU when omitted', async () => {
      const res = await owner.post('/api/products').send({ name: 'LG TV 55' }).expect(201);
      expect(res.body.sku).toMatch(/^P-/);
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.variants[0].sku).toBe(res.body.sku);
    });

    it('rejects duplicate SKU and duplicate barcode with specific codes (atomically)', async () => {
      const sku = `DUP-${uniq()}`;
      const code = `46${uniq()}17`;
      await owner
        .post('/api/products')
        .send({ name: 'First', sku, variants: [{ barcodes: [code] }] })
        .expect(201);

      const dupSku = await owner.post('/api/products').send({ name: 'Second', sku }).expect(409);
      expect(dupSku.body.error.code).toBe('DUPLICATE_SKU');

      const dupBarcode = await owner
        .post('/api/products')
        .send({ name: 'Third', sku: `OK-${uniq()}`, variants: [{ barcodes: [code] }] })
        .expect(409);
      expect(dupBarcode.body.error.code).toBe('DUPLICATE_BARCODE');
      // Транзакция откатилась — товар "Third" не создан
      const search = await owner.get('/api/products?q=Third').expect(200);
      expect(search.body.total).toBe(0);
    });

    it('finds products by name, SKU, barcode and IMEI; looks up a scanned barcode', async () => {
      const code = `47${uniq()}99`;
      const created = await owner
        .post('/api/products')
        .send({
          name: 'Samsung Galaxy A56',
          serialType: 'IMEI',
          variants: [{ name: '8/256 Graphite', barcodes: [code] }],
        })
        .expect(201);
      const variantId = created.body.variants[0].id;

      expect((await owner.get('/api/products?q=galaxy a56').expect(200)).body.items[0].id).toBe(
        created.body.id,
      );
      expect((await owner.get(`/api/products?q=${created.body.sku}`).expect(200)).body.total).toBe(
        1,
      );
      expect((await owner.get(`/api/products?q=${code}`).expect(200)).body.items[0].id).toBe(
        created.body.id,
      );

      const scanned = await owner.get(`/api/products/barcode/${code}`).expect(200);
      expect(scanned.body).toMatchObject({ variantId, product: { id: created.body.id } });
      const unknown = await owner.get('/api/products/barcode/0000000000').expect(404);
      expect(unknown.body.error.code).toBe('BARCODE_NOT_FOUND');

      // IMEI появляется только через приход (этап 4) — здесь создаём напрямую для проверки поиска
      await prismaOf(app).serialNumber.create({
        data: {
          companyId: fx.companyId,
          variantId,
          branchId: fx.branchA,
          type: 'IMEI',
          number: '490154203237518',
        },
      });
      const byImei = await owner.get('/api/products?q=49-015420-323751-8').expect(200);
      expect(byImei.body.items[0].id).toBe(created.body.id);
    });

    it('manages variants and barcodes', async () => {
      const product = await owner
        .post('/api/products')
        .send({ name: 'AirPods', sku: `AP-${uniq()}` })
        .expect(201);
      const withVariant = await owner
        .post(`/api/products/${product.body.id}/variants`)
        .send({ name: 'Pro 2', salePrice: '3490000' })
        .expect(201);
      expect(withVariant.body.variants).toHaveLength(2);

      const variantId = withVariant.body.variants[1].id;
      const updated = await owner
        .patch(`/api/products/variants/${variantId}`)
        .send({ color: 'White' })
        .expect(200);
      expect(updated.body.variants[1].color).toBe('White');

      const withBarcode = await owner
        .post(`/api/products/variants/${variantId}/barcodes`)
        .send({ code: `48${uniq()}00` })
        .expect(201);
      const barcodeId = withBarcode.body.variants[1].barcodes[0].id;
      const removed = await owner.delete(`/api/products/barcodes/${barcodeId}`).expect(200);
      expect(removed.body.variants[1].barcodes).toHaveLength(0);
    });

    it('deactivated products are hidden from the default list', async () => {
      const product = await owner
        .post('/api/products')
        .send({ name: `Old model ${uniq()}` })
        .expect(201);
      await owner.patch(`/api/products/${product.body.id}`).send({ isActive: false }).expect(200);
      expect((await owner.get(`/api/products?q=${product.body.sku}`).expect(200)).body.total).toBe(
        0,
      );
      expect(
        (await owner.get(`/api/products?q=${product.body.sku}&includeInactive=true`).expect(200))
          .body.total,
      ).toBe(1);
    });
  });

  describe('IMEI', () => {
    it('validates IMEI format with the Luhn check digit and reports duplicates', async () => {
      const invalid = await owner
        .get('/api/serial-numbers/check?number=490154203237519')
        .expect(200);
      expect(invalid.body).toMatchObject({ valid: false, exists: false });

      const fresh = await owner.get('/api/serial-numbers/check?number=356938035643809').expect(200);
      expect(fresh.body).toMatchObject({ valid: true, exists: false, number: '356938035643809' });

      const existing = await owner
        .get('/api/serial-numbers/check?number=490154203237518')
        .expect(200);
      expect(existing.body).toMatchObject({ valid: true, exists: true, status: 'IN_STOCK' });
    });

    it('finds a unit by IMEI; unknown IMEI returns IMEI_NOT_FOUND', async () => {
      const found = await owner.get('/api/serial-numbers/490154203237518').expect(200);
      expect(found.body).toMatchObject({ status: 'IN_STOCK', branch: { id: fx.branchA } });
      const missing = await owner.get('/api/serial-numbers/356938035643809').expect(404);
      expect(missing.body.error.code).toBe('IMEI_NOT_FOUND');
    });

    it('the same IMEI cannot be added twice in a company (unique constraint)', async () => {
      const variant = await prismaOf(app).productVariant.findFirstOrThrow({
        where: { companyId: fx.companyId },
      });
      await expect(
        prismaOf(app).serialNumber.create({
          data: {
            companyId: fx.companyId,
            variantId: variant.id,
            branchId: fx.branchA,
            type: 'IMEI',
            number: '490154203237518',
          },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('access control', () => {
    it('seller can view and search but cannot create or edit', async () => {
      const seller = await as(app, fx.users.SELLER.telegramId);
      await seller.get('/api/products').expect(200);
      await seller.get('/api/categories').expect(200);
      const res = await seller.post('/api/products').send({ name: 'Nope' }).expect(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      await seller.post('/api/brands').send({ name: 'Nope' }).expect(403);
    });

    it('warehouse sees IMEI only in accessible branches', async () => {
      const prisma = prismaOf(app);
      const variant = await prisma.productVariant.findFirstOrThrow({
        where: { companyId: fx.companyId },
      });
      await prisma.serialNumber.create({
        data: {
          companyId: fx.companyId,
          variantId: variant.id,
          branchId: fx.branchB,
          type: 'IMEI',
          number: '356938035643809',
        },
      });
      const warehouse = await as(app, fx.users.WAREHOUSE.telegramId);
      await warehouse.get('/api/serial-numbers/490154203237518').expect(200);
      const hidden = await warehouse.get('/api/serial-numbers/356938035643809').expect(404);
      expect(hidden.body.error.code).toBe('IMEI_NOT_FOUND');
    });

    it("company isolation: another company's catalog is invisible and unusable", async () => {
      const mine = await owner
        .post('/api/products')
        .send({ name: `Secret ${uniq()}` })
        .expect(201);
      const myCategory = await owner
        .post('/api/categories')
        .send({ name: `Private ${uniq()}` })
        .expect(201);

      const stranger = await as(app, other.users.OWNER.telegramId);
      const res = await stranger.get(`/api/products/${mine.body.id}`).expect(404);
      expect(res.body.error.code).toBe('PRODUCT_NOT_FOUND');
      expect((await stranger.get(`/api/products?q=${mine.body.sku}`).expect(200)).body.total).toBe(
        0,
      );
      await stranger.patch(`/api/products/${mine.body.id}`).send({ name: 'Hacked' }).expect(404);
      await stranger.post(`/api/products/${mine.body.id}/variants`).send({}).expect(404);
      await stranger
        .patch(`/api/products/variants/${mine.body.variants[0].id}`)
        .send({ color: 'X' })
        .expect(404);

      const foreignCategory = await stranger
        .post('/api/products')
        .send({ name: 'Mine', categoryId: myCategory.body.id })
        .expect(404);
      expect(foreignCategory.body.error.code).toBe('CATEGORY_NOT_FOUND');

      // Одинаковый SKU/штрихкод в разных компаниях допустим
      await stranger
        .post('/api/products')
        .send({ name: 'Same SKU', sku: mine.body.sku })
        .expect(201);
      const imei = await stranger.get('/api/serial-numbers/490154203237518').expect(404);
      expect(imei.body.error.code).toBe('IMEI_NOT_FOUND');
    });
  });
});
