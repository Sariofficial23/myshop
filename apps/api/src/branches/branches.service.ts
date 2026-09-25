import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, Permission } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
  hasPermission,
} from '../auth/auth-context.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateBranchDto, UpdateBranchDto } from './branches.dto.js';

const branchSelect = {
  id: true,
  name: true,
  address: true,
  phone: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class BranchesService {
  constructor(private readonly prisma: PrismaService) {}

  list(ctx: AuthContext, includeInactive = false) {
    const showInactive = includeInactive && hasPermission(ctx, Permission.BRANCHES_MANAGE);
    return this.prisma.branch.findMany({
      where: { ...accessibleBranchWhere(ctx), ...(showInactive ? {} : { isActive: true }) },
      select: branchSelect,
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Все активные филиалы компании (только id и название) — куда можно переместить товар.
   * Складу с доступом к одному филиалу нужно видеть получателей в других филиалах.
   */
  transferTargets(ctx: AuthContext) {
    return this.prisma.branch.findMany({
      where: { companyId: ctx.companyId, isActive: true },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async get(ctx: AuthContext, id: string) {
    const branch = await this.findInCompany(ctx, id);
    assertBranchAccess(ctx, branch.id);
    return branch;
  }

  async create(ctx: AuthContext, dto: CreateBranchDto) {
    return this.withDuplicateCheck(() =>
      this.prisma.branch.create({
        data: { companyId: ctx.companyId, name: dto.name, address: dto.address, phone: dto.phone },
        select: branchSelect,
      }),
    );
  }

  async update(ctx: AuthContext, id: string, dto: UpdateBranchDto) {
    await this.get(ctx, id);
    return this.withDuplicateCheck(() =>
      this.prisma.branch.update({ where: { id }, data: dto, select: branchSelect }),
    );
  }

  /** Филиал ищется только внутри компании пользователя: чужой = "не найден". */
  private async findInCompany(ctx: AuthContext, id: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, companyId: ctx.companyId },
      select: branchSelect,
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
    return branch;
  }

  private async withDuplicateCheck<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppException(
          ErrorCode.DUPLICATE_BRANCH_NAME,
          HttpStatus.CONFLICT,
          'Branch with this name already exists',
        );
      }
      throw error;
    }
  }
}
