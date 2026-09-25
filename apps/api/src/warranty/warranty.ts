import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import {
  canTransitionWarranty,
  DocumentPrefix,
  ErrorCode,
  formatDocumentNumber,
  normalizeSerialNumber,
  Permission,
  WARRANTY_CLAIM_STATUSES,
  type WarrantyClaimStatus,
} from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { nextDocumentNumber } from '../common/documents/document-number.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateWarrantyClaimDto {
  @ApiProperty({ description: 'IMEI / серийный номер проданного устройства' })
  @Transform(trim)
  @IsString()
  @Length(3, 64)
  serialNumber: string;

  @ApiProperty({ description: 'Филиал, где принято устройство' })
  @IsUUID()
  branchId: string;

  @ApiProperty({ example: 'Не заряжается' })
  @Transform(trim)
  @IsString()
  @Length(1, 2000)
  problem: string;
}

export class UpdateWarrantyClaimDto {
  @ApiProperty({ enum: WARRANTY_CLAIM_STATUSES })
  @IsIn(WARRANTY_CLAIM_STATUSES)
  status: WarrantyClaimStatus;

  @ApiPropertyOptional({ example: 'Заменён аккумулятор' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  resolution?: string | null;
}

export class ListWarrantyClaimsQuery {
  @ApiPropertyOptional({ enum: WARRANTY_CLAIM_STATUSES })
  @IsOptional()
  @IsIn(WARRANTY_CLAIM_STATUSES)
  status?: WarrantyClaimStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

const serialSelect = {
  id: true,
  number: true,
  type: true,
  status: true,
  warrantyStart: true,
  warrantyEnd: true,
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      product: { select: { id: true, name: true, warrantyMonths: true } },
    },
  },
  sale: {
    select: {
      id: true,
      number: true,
      date: true,
      branch: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
    },
  },
} satisfies Prisma.SerialNumberSelect;

const claimInclude = {
  branch: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  sale: { select: { id: true, number: true, date: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
  serialNumber: {
    select: {
      id: true,
      number: true,
      warrantyEnd: true,
      variant: { select: { name: true, product: { select: { name: true } } } },
    },
  },
} satisfies Prisma.WarrantyClaimInclude;
type ClaimWithRelations = Prisma.WarrantyClaimGetPayload<{ include: typeof claimInclude }>;

const claimResponse = (c: ClaimWithRelations) => ({
  ...c,
  displayNumber: formatDocumentNumber(DocumentPrefix.WARRANTY_CLAIM, c.number),
  sale: c.sale
    ? { ...c.sale, displayNumber: formatDocumentNumber(DocumentPrefix.SALE, c.sale.number) }
    : null,
});

const fail = (code: ErrorCode, status: HttpStatus, message: string) =>
  new AppException(code, status, message);

@Injectable()
export class WarrantyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Проверка гарантии по IMEI: товар, чек, клиент, срок и история обращений.
   * Клиент может прийти в любой филиал, поэтому поиск — по всей компании.
   */
  async lookup(ctx: AuthContext, rawNumber: string) {
    const serial = await this.findSerial(ctx, rawNumber);
    const claims = await this.prisma.warrantyClaim.findMany({
      where: { companyId: ctx.companyId, serialNumberId: serial.id },
      include: claimInclude,
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return {
      ...serial,
      sale: serial.sale
        ? {
            ...serial.sale,
            displayNumber: formatDocumentNumber(DocumentPrefix.SALE, serial.sale.number),
          }
        : null,
      sold: serial.status === 'SOLD',
      inWarranty: serial.status === 'SOLD' && !!serial.warrantyEnd && serial.warrantyEnd >= now,
      claims: claims.map(claimResponse),
    };
  }

  async list(ctx: AuthContext, query: ListWarrantyClaimsQuery) {
    const page = query.page ?? 1;
    const pageSize = 30;
    const where: Prisma.WarrantyClaimWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.warrantyClaim.findMany({
        where,
        include: claimInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.warrantyClaim.count({ where }),
    ]);
    return { items: items.map(claimResponse), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    const claim = await this.prisma.warrantyClaim.findFirst({
      where: { id, companyId: ctx.companyId },
      include: claimInclude,
    });
    if (!claim) {
      throw fail(ErrorCode.WARRANTY_CLAIM_NOT_FOUND, HttpStatus.NOT_FOUND, 'Claim not found');
    }
    assertBranchAccess(ctx, claim.branchId);
    return claimResponse(claim);
  }

  /** Принять устройство: только проданный номер; фиксируется, в гарантии ли обращение. */
  async create(ctx: AuthContext, dto: CreateWarrantyClaimDto) {
    assertBranchAccess(ctx, dto.branchId);
    const serial = await this.findSerial(ctx, dto.serialNumber);
    if (serial.status !== 'SOLD') {
      throw fail(ErrorCode.SERIAL_NOT_SOLD, HttpStatus.CONFLICT, 'Serial number is not sold');
    }
    const inWarranty = !!serial.warrantyEnd && serial.warrantyEnd >= new Date();
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'WARRANTY_CLAIM');
      const claim = await tx.warrantyClaim.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          number,
          serialNumberId: serial.id,
          saleId: serial.sale?.id ?? null,
          customerId: serial.sale?.customer?.id ?? null,
          inWarranty,
          problem: dto.problem,
          createdById: ctx.userId,
        },
      });
      await this.audit.log(tx, ctx, {
        action: 'CREATE',
        entity: 'WarrantyClaim',
        entityId: claim.id,
        newValue: { number, serial: serial.number, inWarranty, problem: dto.problem },
      });
      return claim.id;
    });
    return this.get(ctx, id);
  }

  /** Смена статуса по допустимым переходам; выдача и отказ закрывают обращение. */
  async update(ctx: AuthContext, id: string, dto: UpdateWarrantyClaimDto) {
    const current = await this.get(ctx, id);
    if (!canTransitionWarranty(current.status, dto.status)) {
      throw fail(
        ErrorCode.INVALID_STATUS_TRANSITION,
        HttpStatus.CONFLICT,
        `Cannot change status from ${current.status} to ${dto.status}`,
      );
    }
    const closing = dto.status === 'RETURNED' || dto.status === 'REJECTED';
    await this.prisma.$transaction(async (tx) => {
      // Условное обновление: параллельная смена статуса не перезапишет чужую
      const { count } = await tx.warrantyClaim.updateMany({
        where: { id, companyId: ctx.companyId, status: current.status },
        data: {
          status: dto.status,
          ...(dto.resolution !== undefined ? { resolution: dto.resolution } : {}),
          ...(closing ? { closedAt: new Date() } : {}),
        },
      });
      if (count === 0) {
        throw fail(ErrorCode.INVALID_STATUS_TRANSITION, HttpStatus.CONFLICT, 'Status changed');
      }
      await this.audit.log(tx, ctx, {
        action: 'UPDATE',
        entity: 'WarrantyClaim',
        entityId: id,
        oldValue: { status: current.status },
        newValue: { status: dto.status, resolution: dto.resolution },
      });
    });
    return this.get(ctx, id);
  }

  private async findSerial(ctx: AuthContext, rawNumber: string) {
    const candidates = [
      ...new Set([
        normalizeSerialNumber('IMEI', rawNumber),
        normalizeSerialNumber('SERIAL', rawNumber),
      ]),
    ];
    const serial = await this.prisma.serialNumber.findFirst({
      where: { companyId: ctx.companyId, number: { in: candidates } },
      select: serialSelect,
    });
    if (!serial) {
      throw fail(ErrorCode.IMEI_NOT_FOUND, HttpStatus.NOT_FOUND, 'Serial number not found');
    }
    return serial;
  }
}

@ApiTags('warranty')
@ApiBearerAuth()
@Controller()
export class WarrantyController {
  constructor(private readonly warranty: WarrantyService) {}

  @Get('warranty/:number')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Проверить гарантию по IMEI / серийному номеру' })
  lookup(@CurrentAuth() ctx: AuthContext, @Param('number') number: string) {
    return this.warranty.lookup(ctx, number);
  }

  @Get('warranty-claims')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Гарантийные обращения' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListWarrantyClaimsQuery) {
    return this.warranty.list(ctx, query);
  }

  @Get('warranty-claims/:id')
  @RequirePermissions(Permission.SALES_VIEW)
  @ApiOperation({ summary: 'Гарантийное обращение' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.warranty.get(ctx, id);
  }

  @Post('warranty-claims')
  @RequirePermissions(Permission.SALES_CREATE)
  @ApiOperation({ summary: 'Принять устройство по гарантии' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateWarrantyClaimDto) {
    return this.warranty.create(ctx, dto);
  }

  @Patch('warranty-claims/:id')
  @RequirePermissions(Permission.SALES_CREATE)
  @ApiOperation({ summary: 'Сменить статус обращения (ремонт, готов, выдан, отказ)' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateWarrantyClaimDto,
  ) {
    return this.warranty.update(ctx, id, dto);
  }
}

@Module({ controllers: [WarrantyController], providers: [WarrantyService] })
export class WarrantyModule {}
