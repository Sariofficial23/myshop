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
import {
  DocumentPrefix,
  ErrorCode,
  formatDocumentNumber,
  Permission,
  WRITE_OFF_REASONS,
  type WriteOffReason,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  accessibleBranchWhere,
  assertBranchAccess,
  type AuthContext,
} from '../auth/auth-context.js';
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

export class CreateWriteOffDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiProperty({ enum: WRITE_OFF_REASONS })
  @IsIn(WRITE_OFF_REASONS)
  reason: WriteOffReason;

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

export class ListWriteOffsQuery {
  @ApiPropertyOptional()
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

const writeOffInclude = {
  branch: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
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
} satisfies Prisma.WriteOffInclude;
type WriteOffWithRelations = Prisma.WriteOffGetPayload<{ include: typeof writeOffInclude }>;

const toResponse = (w: WriteOffWithRelations) => ({
  ...w,
  displayNumber: formatDocumentNumber(DocumentPrefix.WRITE_OFF, w.number),
  costTotal: w.costTotal.toFixed(2),
  items: w.items.map((item) => ({ ...item, unitCost: item.unitCost.toFixed(2) })),
});

const TX_OPTIONS = { timeout: 30_000, maxWait: 10_000 };

@Injectable()
export class WriteOffsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListWriteOffsQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 30;
    const where: Prisma.WriteOffWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.writeOff.findMany({
        where,
        include: writeOffInclude,
        orderBy: [{ date: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.writeOff.count({ where }),
    ]);
    return { items: items.map(toResponse), total, page, pageSize };
  }

  async get(ctx: AuthContext, id: string) {
    const writeOff = await this.prisma.writeOff.findFirst({
      where: { id, companyId: ctx.companyId },
      include: writeOffInclude,
    });
    if (!writeOff) {
      throw new AppException(
        ErrorCode.WRITE_OFF_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Write-off not found',
      );
    }
    assertBranchAccess(ctx, writeOff.branchId);
    return toResponse(writeOff);
  }

  /** Списание — одна транзакция: WRITE_OFF по средней себестоимости, IMEI → WRITTEN_OFF. */
  async create(ctx: AuthContext, dto: CreateWriteOffDto) {
    assertBranchAccess(ctx, dto.branchId);
    const branch = await this.prisma.branch.count({
      where: { id: dto.branchId, companyId: ctx.companyId, isActive: true },
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
    const lines = await prepareStockLines(this.prisma, ctx, dto.items);

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'WRITE_OFF');
      const writeOff = await tx.writeOff.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          number,
          reason: dto.reason,
          notes: dto.notes ?? null,
          costTotal: 0,
          createdById: ctx.userId,
        },
      });
      let costTotal = new Prisma.Decimal(0);
      for (const line of lines) {
        const movement = await this.stock.applyMovement(tx, ctx, {
          branchId: dto.branchId,
          variantId: line.variantId,
          type: 'WRITE_OFF',
          quantity: -line.quantity,
          writeOffId: writeOff.id,
        });
        const unitCost = movement.unitCost ?? new Prisma.Decimal(0);
        costTotal = costTotal.add(unitCost.mul(line.quantity));
        await takeSerialsFromStock(tx, ctx, {
          numbers: line.serialNumbers,
          variantId: line.variantId,
          branchId: dto.branchId,
          data: { status: 'WRITTEN_OFF' },
        });
        await tx.writeOffItem.create({
          data: {
            writeOffId: writeOff.id,
            variantId: line.variantId,
            quantity: line.quantity,
            unitCost,
            serialNumbers: line.serialNumbers,
          },
        });
      }
      await tx.writeOff.update({
        where: { id: writeOff.id },
        data: { costTotal: costTotal.toDecimalPlaces(2) },
      });
      await this.audit.log(tx, ctx, {
        action: 'WRITE_OFF',
        entity: 'WriteOff',
        entityId: writeOff.id,
        newValue: {
          number,
          branchId: dto.branchId,
          reason: dto.reason,
          costTotal: costTotal.toFixed(2),
          items: lines.map((l) => ({
            variantId: l.variantId,
            quantity: l.quantity,
            serials: l.serialNumbers,
          })),
        },
      });
      return writeOff.id;
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }
}

@ApiTags('write-offs')
@ApiBearerAuth()
@Controller('write-offs')
export class WriteOffsController {
  constructor(private readonly writeOffs: WriteOffsService) {}

  @Get()
  @RequirePermissions(Permission.STOCK_VIEW)
  @ApiOperation({ summary: 'Списания' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListWriteOffsQuery) {
    return this.writeOffs.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.STOCK_VIEW)
  @ApiOperation({ summary: 'Списание' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.writeOffs.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.WRITE_OFFS_MANAGE)
  @ApiOperation({ summary: 'Списать товар: брак, порча, утеря (проводится сразу)' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateWriteOffDto) {
    return this.writeOffs.create(ctx, dto);
  }
}

@Module({ controllers: [WriteOffsController], providers: [WriteOffsService] })
export class WriteOffsModule {}
