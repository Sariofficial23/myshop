import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, normalizeBarcode, normalizeImei, normalizeSerial } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import type { AuthContext } from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BrandsService } from './brands.service.js';
import { normalizeBarcodes, validateAttributes } from './catalog-validation.js';
import { notFound, productNotFound, variantNotFound } from './catalog.errors.js';
import type {
  CreateProductDto,
  ListProductsQuery,
  UpdateProductDto,
  UpdateVariantDto,
  VariantInputDto,
} from './catalog.dto.js';
import { CategoriesService } from './categories.service.js';
import { generateSku, variantSku } from './sku.js';

export const productInclude = {
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  variants: {
    orderBy: { createdAt: 'asc' },
    include: { barcodes: { select: { id: true, code: true }, orderBy: { createdAt: 'asc' } } },
  },
} satisfies Prisma.ProductInclude;

type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
type Tx = Prisma.TransactionClient;

/** Decimal → строка: деньги не превращаем в float. */
export function toProductResponse(product: ProductWithRelations) {
  return {
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      salePrice: variant.salePrice?.toFixed(2) ?? null,
    })),
  };
}

export type ProductResponse = ReturnType<typeof toProductResponse>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly categories: CategoriesService,
    private readonly brands: BrandsService,
  ) {}

  /** Список и поиск: название, SKU, название варианта, штрихкод, IMEI / серийный номер. */
  async list(ctx: AuthContext, query: ListProductsQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.ProductWhereInput = {
      companyId: ctx.companyId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.q ? { OR: searchConditions(query.q) } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.product.count({ where }),
    ]);
    return { items: items.map(toProductResponse), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string): Promise<ProductResponse> {
    const product = await this.prisma.product.findFirst({
      where: { id, companyId: ctx.companyId },
      include: productInclude,
    });
    if (!product) throw productNotFound();
    return toProductResponse(product);
  }

  /** Сканер вернул код → backend ищет вариант. Бизнес-логика не зависит от библиотеки сканирования. */
  async findByBarcode(ctx: AuthContext, rawCode: string) {
    const barcode = await this.prisma.barcode.findUnique({
      where: { companyId_code: { companyId: ctx.companyId, code: normalizeBarcode(rawCode) } },
      select: { variantId: true, variant: { select: { productId: true } } },
    });
    if (!barcode) throw notFound(ErrorCode.BARCODE_NOT_FOUND, 'Barcode not found');
    const product = await this.get(ctx, barcode.variant.productId);
    return { product, variantId: barcode.variantId };
  }

  /** Товар, варианты и штрихкоды создаются атомарно. */
  async create(ctx: AuthContext, dto: CreateProductDto): Promise<ProductResponse> {
    await this.assertReferences(ctx, dto);
    const productSku = dto.sku ?? generateSku();
    const variants: VariantInputDto[] = dto.variants?.length ? dto.variants : [{}];
    const barcodesPerVariant = variants.map((v) => normalizeBarcodes(v.barcodes ?? []));
    normalizeBarcodes(barcodesPerVariant.flat()); // один код — один вариант

    const created = await this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          companyId: ctx.companyId,
          name: dto.name,
          sku: productSku,
          categoryId: dto.categoryId ?? null,
          brandId: dto.brandId ?? null,
          description: dto.description ?? null,
          unit: dto.unit,
          minimumStock: dto.minimumStock,
          serialType: dto.serialType ?? null,
          warrantyMonths: dto.warrantyMonths,
        },
      });
      for (const [index, variant] of variants.entries()) {
        await this.createVariant(tx, ctx, product.id, {
          ...variant,
          sku: variant.sku ?? variantSku(productSku, index, variants.length),
          barcodes: barcodesPerVariant[index],
        });
      }
      return product;
    });
    return this.get(ctx, created.id);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateProductDto): Promise<ProductResponse> {
    const product = await this.get(ctx, id);
    await this.assertReferences(ctx, dto);
    if (dto.serialType !== undefined && dto.serialType !== product.serialType) {
      await this.assertNoSerialNumbers(product.id);
    }
    await this.prisma.product.update({ where: { id }, data: dto });
    return this.get(ctx, id);
  }

  async addVariant(
    ctx: AuthContext,
    productId: string,
    dto: VariantInputDto,
  ): Promise<ProductResponse> {
    const product = await this.get(ctx, productId);
    const barcodes = normalizeBarcodes(dto.barcodes ?? []);
    await this.prisma.$transaction((tx) =>
      this.createVariant(tx, ctx, product.id, {
        ...dto,
        sku: dto.sku ?? `${product.sku}-${product.variants.length + 1}`,
        barcodes,
      }),
    );
    return this.get(ctx, productId);
  }

  async updateVariant(
    ctx: AuthContext,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductResponse> {
    const variant = await this.findVariant(ctx, variantId);
    await this.prisma.productVariant.update({
      where: { id: variant.id },
      data: {
        ...dto,
        attributes: dto.attributes === undefined ? undefined : validateAttributes(dto.attributes),
      },
    });
    return this.get(ctx, variant.productId);
  }

  async addBarcode(ctx: AuthContext, variantId: string, code: string): Promise<ProductResponse> {
    const variant = await this.findVariant(ctx, variantId);
    const [normalized] = normalizeBarcodes([code]);
    await this.prisma.barcode.create({
      data: { companyId: ctx.companyId, variantId: variant.id, code: normalized! },
    });
    return this.get(ctx, variant.productId);
  }

  async removeBarcode(ctx: AuthContext, barcodeId: string): Promise<ProductResponse> {
    const barcode = await this.prisma.barcode.findFirst({
      where: { id: barcodeId, companyId: ctx.companyId },
      select: { id: true, variant: { select: { productId: true } } },
    });
    if (!barcode) throw notFound(ErrorCode.BARCODE_NOT_FOUND, 'Barcode not found');
    await this.prisma.barcode.delete({ where: { id: barcode.id } });
    return this.get(ctx, barcode.variant.productId);
  }

  private async createVariant(
    tx: Tx,
    ctx: AuthContext,
    productId: string,
    input: VariantInputDto & { sku: string; barcodes: string[] },
  ) {
    return tx.productVariant.create({
      data: {
        companyId: ctx.companyId,
        productId,
        sku: input.sku,
        name: input.name ?? null,
        model: input.model ?? null,
        color: input.color ?? null,
        memory: input.memory ?? null,
        storage: input.storage ?? null,
        attributes: validateAttributes(input.attributes),
        salePrice: input.salePrice ?? null,
        barcodes: {
          create: input.barcodes.map((code) => ({ companyId: ctx.companyId, code })),
        },
      },
    });
  }

  private async findVariant(ctx: AuthContext, variantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, companyId: ctx.companyId },
      select: { id: true, productId: true },
    });
    if (!variant) throw variantNotFound();
    return variant;
  }

  /** Категория и бренд должны принадлежать той же компании. */
  private async assertReferences(
    ctx: AuthContext,
    dto: { categoryId?: string | null; brandId?: string | null },
  ) {
    if (dto.categoryId) await this.categories.assertInCompany(ctx, dto.categoryId);
    if (dto.brandId) await this.brands.assertInCompany(ctx, dto.brandId);
  }

  /** Нельзя сменить тип учёта (IMEI/серийный/без номера), если по товару уже есть номера. */
  private async assertNoSerialNumbers(productId: string) {
    const count = await this.prisma.serialNumber.count({ where: { variant: { productId } } });
    if (count > 0) {
      throw new AppException(
        ErrorCode.CONFLICT,
        HttpStatus.CONFLICT,
        'Cannot change serial type: product already has serial numbers',
      );
    }
  }
}

function searchConditions(q: string): Prisma.ProductWhereInput[] {
  const contains = { contains: q, mode: 'insensitive' as const };
  const exactCodes = [...new Set([normalizeBarcode(q), normalizeImei(q), normalizeSerial(q)])];
  return [
    { name: contains },
    { sku: contains },
    {
      variants: {
        some: {
          OR: [
            { sku: contains },
            { name: contains },
            { barcodes: { some: { code: { in: exactCodes } } } },
            { serialNumbers: { some: { number: { in: exactCodes } } } },
          ],
        },
      },
    },
  ];
}
