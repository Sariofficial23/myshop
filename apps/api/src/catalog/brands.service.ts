import { Injectable } from '@nestjs/common';
import type { AuthContext } from '../auth/auth-context.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { brandNotFound } from './catalog.errors.js';
import type { CreateBrandDto, UpdateBrandDto } from './catalog.dto.js';

const brandSelect = {
  id: true,
  name: true,
  isActive: true,
  _count: { select: { products: true } },
} as const;

function withProductsCount<T extends { _count: { products: number } }>({ _count, ...rest }: T) {
  return { ...rest, productsCount: _count.products };
}

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: AuthContext, includeInactive = false) {
    return this.prisma.brand
      .findMany({
        where: { companyId: ctx.companyId, ...(includeInactive ? {} : { isActive: true }) },
        select: brandSelect,
        orderBy: { name: 'asc' },
      })
      .then((rows) => rows.map(withProductsCount));
  }

  create(ctx: AuthContext, dto: CreateBrandDto) {
    return this.prisma.brand
      .create({
        data: { companyId: ctx.companyId, name: dto.name },
        select: brandSelect,
      })
      .then(withProductsCount);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateBrandDto) {
    await this.assertInCompany(ctx, id);
    return this.prisma.brand
      .update({ where: { id }, data: dto, select: brandSelect })
      .then(withProductsCount);
  }

  async assertInCompany(ctx: AuthContext, id: string): Promise<void> {
    const found = await this.prisma.brand.count({ where: { id, companyId: ctx.companyId } });
    if (!found) throw brandNotFound();
  }
}
