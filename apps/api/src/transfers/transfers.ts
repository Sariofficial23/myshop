import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Injectable,
  Module,
  Param,
  ParseUUIDPipe,
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
import { DocumentPrefix, ErrorCode, formatDocumentNumber, Permission } from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { assertBranchAccess, type AuthContext, canAccessBranch } from '../auth/auth-context.js';
import { AuditService } from '../audit/audit.service.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { nextDocumentNumber } from '../common/documents/document-number.js';
import {
  prepareStockLines,
  StockLineDto,
  takeSerialsFromStock,
} from '../common/documents/stock-lines.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class CreateTransferDto {
  @ApiProperty()
  @IsUUID()
  fromBranchId: string;

  @ApiProperty()
  @IsUUID()
  toBranchId: string;

  @ApiProperty({ type: [StockLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => StockLineDto)
  items: StockLineDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class ListTransfersQuery {
  @ApiPropertyOptional({ description: 'Филиал-отправитель или получатель' })
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const transferInclude = {
  fromBranch: { select: { id: true, name: true } },
  toBranch: { select: { id: true, name: true } },
  createdBy: person,
  items: {
    orderBy: { id: 'asc' },
    include: {
      variant: {
        select: {
          id: true,
          sku: true,
          name: true,
          product: { select: { id: true, name: true, serialType: true } },
        },
      },
    },
  },
} satisfies Prisma.TransferInclude;
type TransferWithRelations = Prisma.TransferGetPayload<{ include: typeof transferInclude }>;

const toResponse = (t: TransferWithRelations) => ({
  ...t,
  displayNumber: formatDocumentNumber(DocumentPrefix.TRANSFER, t.number),
  items: t.items.map((item) => ({ ...item, unitCost: item.unitCost.toFixed(2) })),
});

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

/** Документ виден, если сотрудник имеет доступ к филиалу-отправителю или получателю. */
function visibleWhere(ctx: AuthContext): Prisma.TransferWhereInput {
  return ctx.allBranches
    ? { companyId: ctx.companyId }
    : {
        companyId: ctx.companyId,
        OR: [
          { fromBranchId: { in: [...ctx.branchIds] } },
          { toBranchId: { in: [...ctx.branchIds] } },
        ],
      };
}

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListTransfersQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.TransferWhereInput = {
      AND: [
        visibleWhere(ctx),
        query.branchId
          ? { OR: [{ fromBranchId: query.branchId }, { toBranchId: query.branchId }] }
          : {},
      ],
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.transfer.findMany({
        where,
        include: transferInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.transfer.count({ where }),
    ]);
    return { items: items.map(toResponse), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    const transfer = await this.prisma.transfer.findFirst({
      where: { id, companyId: ctx.companyId },
      include: transferInclude,
    });
    if (
      !transfer ||
      !(canAccessBranch(ctx, transfer.fromBranchId) || canAccessBranch(ctx, transfer.toBranchId))
    ) {
      throw new AppException(
        ErrorCode.TRANSFER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Transfer not found',
      );
    }
    return toResponse(transfer);
  }

  /**
   * Перемещение — одна транзакция: TRANSFER_OUT из филиала-отправителя по средней себестоимости,
   * TRANSFER_IN в филиал-получатель с той же себестоимостью, IMEI меняют филиал.
   * Отправлять можно только из своего филиала; получателем может быть любой филиал компании.
   */
  async create(ctx: AuthContext, dto: CreateTransferDto) {
    assertBranchAccess(ctx, dto.fromBranchId);
    if (dto.fromBranchId === dto.toBranchId) {
      throw new AppException(
        ErrorCode.SAME_BRANCH_TRANSFER,
        HttpStatus.BAD_REQUEST,
        'Source and destination branches must differ',
      );
    }
    const branches = await this.prisma.branch.count({
      where: {
        id: { in: [dto.fromBranchId, dto.toBranchId] },
        companyId: ctx.companyId,
        isActive: true,
      },
    });
    if (branches !== 2) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
    const lines = await prepareStockLines(this.prisma, ctx, dto.items);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'TRANSFER');
      const transfer = await tx.transfer.create({
        data: {
          companyId: ctx.companyId,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          number,
          notes: dto.notes ?? null,
          createdById: ctx.userId,
        },
      });
      for (const line of lines) {
        const out = await this.stock.applyMovement(tx, ctx, {
          branchId: dto.fromBranchId,
          variantId: line.variantId,
          type: 'TRANSFER_OUT',
          quantity: -line.quantity,
          transferId: transfer.id,
        });
        const unitCost = out.unitCost ?? new Prisma.Decimal(0);
        await this.stock.applyMovement(tx, ctx, {
          branchId: dto.toBranchId,
          variantId: line.variantId,
          type: 'TRANSFER_IN',
          quantity: line.quantity,
          unitCost,
          transferId: transfer.id,
        });
        await takeSerialsFromStock(tx, ctx, {
          numbers: line.serialNumbers,
          variantId: line.variantId,
          branchId: dto.fromBranchId,
          data: { branchId: dto.toBranchId },
        });
        await tx.transferItem.create({
          data: {
            transferId: transfer.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost,
            serialNumbers: line.serialNumbers,
          },
        });
      }
      await this.audit.log(tx, ctx, {
        action: 'TRANSFER',
        entity: 'Transfer',
        entityId: transfer.id,
        newValue: {
          number,
          fromBranchId: dto.fromBranchId,
          toBranchId: dto.toBranchId,
          items: lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            serials: l.serialNumbers,
          })),
        },
      });
      return transfer.id;
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }
}

@ApiTags('transfers')
@ApiBearerAuth()
@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequirePermissions(Permission.STOCK_VIEW)
  @ApiOperation({ summary: 'Перемещения между филиалами' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListTransfersQuery) {
    return this.transfers.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.STOCK_VIEW)
  @ApiOperation({ summary: 'Перемещение' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.transfers.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.TRANSFERS_MANAGE)
  @ApiOperation({ summary: 'Переместить товар в другой филиал (проводится сразу)' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateTransferDto) {
    return this.transfers.create(ctx, dto);
  }
}

@Module({
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
