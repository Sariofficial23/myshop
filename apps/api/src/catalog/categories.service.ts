import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { categoryNotFound } from './catalog.errors.js';
import type { CreateCategoryDto, UpdateCategoryDto } from './catalog.dto.js';

const categorySelect = {
  id: true,
  name: true,
  parentId: true,
  isActive: true,
  _count: { select: { products: true } },
} as const;

function withProductsCount<T extends { _count: { products: number } }>({ _count, ...rest }: T) {
  return { ...rest, productsCount: _count.products };
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: AuthContext, includeInactive = false) {
    return this.prisma.category
      .findMany({
        where: { companyId: ctx.companyId, ...(includeInactive ? {} : { isActive: true }) },
        select: categorySelect,
        orderBy: { name: 'asc' },
      })
      .then((rows) => rows.map(withProductsCount));
  }

  async create(ctx: AuthContext, dto: CreateCategoryDto) {
    if (dto.parentId) await this.assertInCompany(ctx, dto.parentId);
    return this.prisma.category
      .create({
        data: { companyId: ctx.companyId, name: dto.name, parentId: dto.parentId ?? null },
        select: categorySelect,
      })
      .then(withProductsCount);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateCategoryDto) {
    await this.assertInCompany(ctx, id);
    if (dto.parentId) await this.assertNoCycle(ctx, id, dto.parentId);
    return this.prisma.category
      .update({ where: { id }, data: dto, select: categorySelect })
      .then(withProductsCount);
  }

  async assertInCompany(ctx: AuthContext, id: string): Promise<void> {
    const found = await this.prisma.category.count({ where: { id, companyId: ctx.companyId } });
    if (!found) throw categoryNotFound();
  }

  /** Нельзя сделать категорию дочерней самой себе или своему потомку. */
  private async assertNoCycle(ctx: AuthContext, id: string, parentId: string): Promise<void> {
    await this.assertInCompany(ctx, parentId);
    let current: string | null = parentId;
    for (let depth = 0; current && depth < 50; depth++) {
      if (current === id) {
        throw new AppException(ErrorCode.CATEGORY_CYCLE, HttpStatus.BAD_REQUEST, 'Category cycle');
      }
      const parent: { parentId: string | null } | null = await this.prisma.category.findUnique({
        where: { id: current },
        select: { parentId: true },
      });
      current = parent?.parentId ?? null;
    }
  }
}
