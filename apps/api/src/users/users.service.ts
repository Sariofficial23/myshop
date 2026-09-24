import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode, hasAllBranchesByDefault, type Role } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import type { AuthContext } from '../auth/auth-context.js';
import { SessionService } from '../auth/session.service.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  assertCanAssignBranches,
  assertCanGrantPermissions,
  assertCanManageRole,
  assertHasBranchAccess,
} from './staff-policy.js';
import type { CreateUserDto, UpdateUserDto } from './users.dto.js';

const membershipInclude = {
  user: true,
  branches: { include: { branch: { select: { id: true, name: true } } } },
} satisfies Prisma.MembershipInclude;

type MembershipWithUser = Prisma.MembershipGetPayload<{ include: typeof membershipInclude }>;
type Tx = Prisma.TransactionClient;

export interface StaffMember {
  id: string;
  telegramId: string | null;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  role: Role;
  allBranches: boolean;
  branches: Array<{ id: string; name: string }>;
  extraPermissions: string[];
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

function toStaffMember(m: MembershipWithUser): StaffMember {
  return {
    id: m.user.id,
    telegramId: m.user.telegramId?.toString() ?? null,
    firstName: m.user.firstName,
    lastName: m.user.lastName,
    username: m.user.username,
    phone: m.user.phone,
    role: m.role,
    allBranches: m.allBranches,
    branches: m.branches.map((b) => b.branch),
    extraPermissions: m.extraPermissions,
    isActive: m.isActive && m.user.isActive,
    lastLoginAt: m.lastLoginAt,
    createdAt: m.createdAt,
  };
}

const notFound = () =>
  new AppException(ErrorCode.USER_NOT_FOUND, HttpStatus.NOT_FOUND, 'User not found');

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /** Сотрудники ТОЛЬКО текущей компании. */
  async list(ctx: AuthContext): Promise<StaffMember[]> {
    const memberships = await this.prisma.membership.findMany({
      where: { companyId: ctx.companyId },
      include: membershipInclude,
      orderBy: [{ isActive: 'desc' }, { role: 'asc' }, { createdAt: 'asc' }],
    });
    return memberships.map(toStaffMember);
  }

  async get(ctx: AuthContext, userId: string): Promise<StaffMember> {
    return toStaffMember(await this.findMembership(this.prisma, ctx, userId));
  }

  async create(ctx: AuthContext, dto: CreateUserDto): Promise<StaffMember> {
    assertCanManageRole(ctx.role, dto.role);
    const allBranches = dto.allBranches ?? hasAllBranchesByDefault(dto.role);
    const branchIds = allBranches ? [] : [...new Set(dto.branchIds ?? [])];
    assertHasBranchAccess(allBranches, branchIds);
    assertCanAssignBranches(ctx, allBranches, branchIds);
    const extraPermissions = assertCanGrantPermissions(ctx, dto.extraPermissions ?? []);

    const membership = await this.prisma.$transaction(async (tx) => {
      await this.assertBranchesInCompany(tx, ctx, branchIds);

      let user = dto.telegramId
        ? await tx.user.findUnique({ where: { telegramId: BigInt(dto.telegramId) } })
        : null;
      if (user) {
        const existing = await tx.membership.findUnique({
          where: { companyId_userId: { companyId: ctx.companyId, userId: user.id } },
        });
        if (existing) {
          throw new AppException(
            ErrorCode.USER_ALREADY_MEMBER,
            HttpStatus.CONFLICT,
            'This Telegram user is already an employee of the company',
          );
        }
      } else {
        user = await tx.user.create({
          data: {
            firstName: dto.firstName,
            lastName: dto.lastName ?? null,
            phone: dto.phone ?? null,
            telegramId: dto.telegramId ? BigInt(dto.telegramId) : null,
          },
        });
      }

      return tx.membership.create({
        data: {
          companyId: ctx.companyId,
          userId: user.id,
          role: dto.role,
          allBranches,
          extraPermissions,
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
        include: membershipInclude,
      });
    });
    return toStaffMember(membership);
  }

  async update(ctx: AuthContext, userId: string, dto: UpdateUserDto): Promise<StaffMember> {
    const accessChange =
      dto.role !== undefined ||
      dto.isActive !== undefined ||
      dto.allBranches !== undefined ||
      dto.branchIds !== undefined ||
      dto.extraPermissions !== undefined;

    const updated = await this.prisma.$transaction(async (tx) => {
      const target = await this.findMembership(tx, ctx, userId);

      if (accessChange && target.userId === ctx.userId) {
        throw new AppException(
          ErrorCode.CANNOT_MODIFY_SELF,
          HttpStatus.FORBIDDEN,
          'You cannot change your own role, access or status',
        );
      }
      if (target.userId !== ctx.userId) {
        assertCanManageRole(ctx.role, target.role);
      }
      if (dto.role) assertCanManageRole(ctx.role, dto.role);

      // Нельзя оставить компанию без активного владельца
      const losesOwner =
        target.role === 'OWNER' &&
        target.isActive &&
        ((dto.role && dto.role !== 'OWNER') || dto.isActive === false);
      if (losesOwner) {
        const otherOwners = await tx.membership.count({
          where: {
            companyId: ctx.companyId,
            role: 'OWNER',
            isActive: true,
            id: { not: target.id },
          },
        });
        if (otherOwners === 0) {
          throw new AppException(
            ErrorCode.LAST_OWNER,
            HttpStatus.CONFLICT,
            'Company must keep an owner',
          );
        }
      }

      const membershipData: Prisma.MembershipUpdateInput = {};
      if (dto.role) membershipData.role = dto.role;
      if (dto.isActive !== undefined) membershipData.isActive = dto.isActive;
      if (dto.extraPermissions) {
        membershipData.extraPermissions = assertCanGrantPermissions(ctx, dto.extraPermissions);
      }

      if (dto.allBranches !== undefined || dto.branchIds !== undefined) {
        const allBranches = dto.allBranches ?? target.allBranches;
        const branchIds = allBranches
          ? []
          : [...new Set(dto.branchIds ?? target.branches.map((b) => b.branchId))];
        assertHasBranchAccess(allBranches, branchIds);
        assertCanAssignBranches(ctx, allBranches, branchIds);
        await this.assertBranchesInCompany(tx, ctx, branchIds);
        membershipData.allBranches = allBranches;
        membershipData.branches = {
          deleteMany: {},
          create: branchIds.map((branchId) => ({ branchId })),
        };
      }

      await this.updateProfile(tx, ctx, target, dto);
      await tx.membership.update({ where: { id: target.id }, data: membershipData });

      if (dto.isActive === false) {
        await this.sessions.revokeAllForMembership(target.id, tx);
      }
      return this.findMembership(tx, ctx, userId);
    });
    return toStaffMember(updated);
  }

  /**
   * Профиль пользователя общий для всех его компаний. Менять его может только
   * компания, в которой он единственная — иначе один магазин переписал бы данные другого.
   */
  private async updateProfile(
    tx: Tx,
    ctx: AuthContext,
    target: MembershipWithUser,
    dto: UpdateUserDto,
  ) {
    const data: Prisma.UserUpdateInput = {};
    if (dto.firstName !== undefined) data.firstName = dto.firstName;
    if (dto.lastName !== undefined) data.lastName = dto.lastName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.telegramId !== undefined && dto.telegramId !== target.user.telegramId?.toString()) {
      if (target.user.telegramId !== null) {
        throw AppException.forbidden('Telegram account is already linked');
      }
      const taken = await tx.user.findUnique({ where: { telegramId: BigInt(dto.telegramId) } });
      if (taken) {
        throw new AppException(
          ErrorCode.TELEGRAM_ID_TAKEN,
          HttpStatus.CONFLICT,
          'Telegram ID is already used',
        );
      }
      data.telegramId = BigInt(dto.telegramId);
    }
    if (Object.keys(data).length === 0) return;

    const otherCompanies = await tx.membership.count({
      where: { userId: target.userId, companyId: { not: ctx.companyId } },
    });
    if (otherCompanies > 0 && target.userId !== ctx.userId) {
      throw AppException.forbidden(
        'Profile of an employee shared with other companies cannot be edited',
      );
    }
    await tx.user.update({ where: { id: target.userId }, data });
  }

  private async findMembership(
    tx: Tx,
    ctx: AuthContext,
    userId: string,
  ): Promise<MembershipWithUser> {
    const membership = await tx.membership.findUnique({
      where: { companyId_userId: { companyId: ctx.companyId, userId } },
      include: membershipInclude,
    });
    if (!membership) throw notFound();
    return membership;
  }

  private async assertBranchesInCompany(tx: Tx, ctx: AuthContext, branchIds: string[]) {
    if (branchIds.length === 0) return;
    const count = await tx.branch.count({
      where: { id: { in: branchIds }, companyId: ctx.companyId, isActive: true },
    });
    if (count !== branchIds.length) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
  }
}
