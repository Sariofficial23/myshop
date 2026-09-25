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
  Put,
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
  DOCUMENT_STATUSES,
  DocumentPrefix,
  type DocumentStatus,
  ErrorCode,
  formatDocumentNumber,
  Permission,
} from '@myshop/shared';
import { Prisma } from '@myshop/database';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
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
  type StockLine,
  StockLineDto,
} from '../common/documents/stock-lines.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StockService } from '../stock/stock.service.js';

type Tx = Prisma.TransactionClient;

const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;

export class InventoryItemsDto {
  @ApiProperty({
    type: [StockLineDto],
    description: 'Подсчитанные товары: quantity — факт (можно 0), для IMEI — найденные номера',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
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

export class CreateInventoryDto extends InventoryItemsDto {
  @ApiProperty()
  @IsUUID()
  branchId: string;

  @ApiPropertyOptional({ description: 'Сразу провести' })
  @IsOptional()
  @IsBoolean()
  confirm?: boolean;
}

export class ListInventoriesQuery {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional({ enum: DOCUMENT_STATUSES })
  @IsOptional()
  @IsIn(DOCUMENT_STATUSES)
  status?: DocumentStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

const person = { select: { id: true, firstName: true, lastName: true } } as const;
const inventoryInclude = {
  branch: { select: { id: true, name: true } },
  createdBy: person,
  confirmedBy: person,
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
} satisfies Prisma.InventoryInclude;
type InventoryWithRelations = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 };

const notFound = () =>
  new AppException(ErrorCode.INVENTORY_NOT_FOUND, HttpStatus.NOT_FOUND, 'Inventory not found');
const notDraft = () =>
  new AppException(
    ErrorCode.DOCUMENT_NOT_DRAFT,
    HttpStatus.CONFLICT,
    'Only draft documents can be changed or confirmed',
  );

@Injectable()
export class InventoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: StockService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: AuthContext, query: ListInventoriesQuery) {
    if (query.branchId) assertBranchAccess(ctx, query.branchId);
    const page = query.page ?? 1;
    const pageSize = 30;
    const where: Prisma.InventoryWhereInput = {
      companyId: ctx.companyId,
      branch: accessibleBranchWhere(ctx),
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        include: { ...inventoryInclude, items: false, _count: { select: { items: true } } },
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.inventory.count({ where }),
    ]);
    return {
      items: items.map(({ _count, ...inv }) => ({
        ...inv,
        displayNumber: formatDocumentNumber(DocumentPrefix.INVENTORY, inv.number),
        itemsCount: _count.items,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * Для черновика показываем текущий учётный остаток и расхождение (предпросмотр);
   * для проведённой — зафиксированные при проведении значения.
   */
  async get(ctx: AuthContext, id: string) {
    const inventory = await this.find(ctx, id);
    let current = new Map<string, number>();
    if (inventory.status === 'DRAFT') {
      const balances = await this.prisma.stockBalance.findMany({
        where: {
          branchId: inventory.branchId,
          variantId: { in: inventory.items.map((i) => i.variantId) },
        },
        select: { variantId: true, quantity: true },
      });
      current = new Map(balances.map((b) => [b.variantId, b.quantity]));
    }
    return {
      ...inventory,
      displayNumber: formatDocumentNumber(DocumentPrefix.INVENTORY, inventory.number),
      items: inventory.items.map((item) => {
        const expected =
          inventory.status === 'DRAFT'
            ? (current.get(item.variantId) ?? 0)
            : (item.expectedQuantity ?? 0);
        return {
          ...item,
          unitCost: item.unitCost?.toFixed(2) ?? null,
          expectedQuantity: expected,
          difference: item.countedQuantity - expected,
        };
      }),
    };
  }

  async create(ctx: AuthContext, dto: CreateInventoryDto) {
    assertBranchAccess(ctx, dto.branchId);
    const branch = await this.prisma.branch.count({
      where: { id: dto.branchId, companyId: ctx.companyId, isActive: true },
    });
    if (!branch) {
      throw new AppException(ErrorCode.BRANCH_NOT_FOUND, HttpStatus.NOT_FOUND, 'Branch not found');
    }
    const lines = await prepareStockLines(this.prisma, ctx, dto.items, { allowZero: true });
    const id = await this.prisma.$transaction(async (tx) => {
      const number = await nextDocumentNumber(tx, ctx.companyId, 'INVENTORY');
      const inventory = await tx.inventory.create({
        data: {
          companyId: ctx.companyId,
          branchId: dto.branchId,
          number,
          notes: dto.notes ?? null,
          createdById: ctx.userId,
          items: { create: lines.map(itemData) },
        },
      });
      await this.audit.log(tx, ctx, {
        action: 'CREATE',
        entity: 'Inventory',
        entityId: inventory.id,
        newValue: { number, branchId: dto.branchId, items: lines.length },
      });
      if (dto.confirm) await this.confirmInTx(tx, ctx, inventory.id);
      return inventory.id;
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }

  /** Заменить подсчёт в черновике (например, после пересчёта полки). */
  async update(ctx: AuthContext, id: string, dto: InventoryItemsDto) {
    const current = await this.find(ctx, id);
    if (current.status !== 'DRAFT') throw notDraft();
    const lines = await prepareStockLines(this.prisma, ctx, dto.items, { allowZero: true });
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventory.updateMany({
        where: { id, companyId: ctx.companyId, status: 'DRAFT' },
        data: dto.notes !== undefined ? { notes: dto.notes } : {},
      });
      if (count === 0) throw notDraft();
      await tx.inventoryItem.deleteMany({ where: { inventoryId: id } });
      await tx.inventoryItem.createMany({
        data: lines.map((line) => ({ ...itemData(line), inventoryId: id })),
      });
      await this.audit.log(tx, ctx, { action: 'UPDATE', entity: 'Inventory', entityId: id });
    }, TX_OPTIONS);
    return this.get(ctx, id);
  }

  async confirm(ctx: AuthContext, id: string) {
    await this.find(ctx, id);
    await this.prisma.$transaction((tx) => this.confirmInTx(tx, ctx, id), TX_OPTIONS);
    return this.get(ctx, id);
  }

  async cancel(ctx: AuthContext, id: string) {
    await this.find(ctx, id);
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.inventory.updateMany({
        where: { id, companyId: ctx.companyId, status: 'DRAFT' },
        data: { status: 'CANCELLED' },
      });
      if (count === 0) throw notDraft();
      await this.audit.log(tx, ctx, {
        action: 'UPDATE',
        entity: 'Inventory',
        entityId: id,
        newValue: { status: 'CANCELLED' },
      });
    });
    return this.get(ctx, id);
  }

  /**
   * Проведение: для каждой подсчитанной позиции остаток блокируется и доводится до факта
   * движением INVENTORY_ADJUSTMENT (+ излишек по средней себестоимости, − недостача).
   * IMEI: найденные должны числиться в наличии этого филиала; не найденные → WRITTEN_OFF.
   * Позиции, которых нет в документе, не меняются (частичная инвентаризация).
   */
  private async confirmInTx(tx: Tx, ctx: AuthContext, id: string) {
    const { count } = await tx.inventory.updateMany({
      where: { id, companyId: ctx.companyId, status: 'DRAFT' },
      data: { status: 'CONFIRMED', confirmedById: ctx.userId, confirmedAt: new Date() },
    });
    if (count === 0) throw notDraft();
    const inventory = await tx.inventory.findUniqueOrThrow({
      where: { id },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
    assertBranchAccess(ctx, inventory.branchId);

    const summary: Array<{ variantId: string; expected: number; counted: number }> = [];
    for (const item of inventory.items) {
      const locked = await this.stock.lockBalance(tx, ctx, inventory.branchId, item.variantId);
      let missingSerials: string[] = [];
      if (item.variant.product.serialType) {
        const inStock = await tx.serialNumber.findMany({
          where: {
            companyId: ctx.companyId,
            variantId: item.variantId,
            branchId: inventory.branchId,
            status: 'IN_STOCK',
          },
          select: { number: true },
        });
        const inStockSet = new Set(inStock.map((s) => s.number));
        const unknown = item.serialNumbers.filter((n) => !inStockSet.has(n));
        if (unknown.length) {
          // Найден номер, которого нет в наличии: его нужно оформить приходом или перемещением
          throw new AppException(
            ErrorCode.SERIAL_NOT_IN_STOCK,
            HttpStatus.CONFLICT,
            'Counted serials are not in stock of this branch',
            { numbers: unknown },
          );
        }
        const counted = new Set(item.serialNumbers);
        missingSerials = [...inStockSet].filter((n) => !counted.has(n));
        if (missingSerials.length) {
          const { count: updated } = await tx.serialNumber.updateMany({
            where: {
              companyId: ctx.companyId,
              number: { in: missingSerials },
              branchId: inventory.branchId,
              status: 'IN_STOCK',
            },
            data: { status: 'WRITTEN_OFF' },
          });
          if (updated !== missingSerials.length) {
            throw new AppException(
              ErrorCode.SERIAL_NOT_IN_STOCK,
              HttpStatus.CONFLICT,
              'Serials changed concurrently',
              { numbers: missingSerials },
            );
          }
        }
      }

      const difference = item.countedQuantity - locked.quantity;
      if (difference !== 0) {
        await this.stock.applyMovement(tx, ctx, {
          branchId: inventory.branchId,
          variantId: item.variantId,
          type: 'INVENTORY_ADJUSTMENT',
          quantity: difference,
          // Излишек оприходуется по текущей средней себестоимости — она не меняется
          unitCost: difference > 0 ? locked.avg_cost : undefined,
          inventoryId: inventory.id,
        });
      }
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: { expectedQuantity: locked.quantity, missingSerials, unitCost: locked.avg_cost },
      });
      summary.push({
        variantId: item.variantId,
        expected: locked.quantity,
        counted: item.countedQuantity,
      });
    }

    await this.audit.log(tx, ctx, {
      action: 'INVENTORY_ADJUSTMENT',
      entity: 'Inventory',
      entityId: inventory.id,
      newValue: {
        number: inventory.number,
        branchId: inventory.branchId,
        items: summary.filter((s) => s.expected !== s.counted),
      },
    });
  }

  private async find(ctx: AuthContext, id: string): Promise<InventoryWithRelations> {
    const inventory = await this.prisma.inventory.findFirst({
      where: { id, companyId: ctx.companyId },
      include: inventoryInclude,
    });
    if (!inventory) throw notFound();
    assertBranchAccess(ctx, inventory.branchId);
    return inventory;
  }
}

function itemData(line: StockLine) {
  return {
    variantId: line.variantId,
    countedQuantity: line.quantity,
    serialNumbers: line.serialNumbers,
  };
}

@ApiTags('inventories')
@ApiBearerAuth()
@Controller('inventories')
export class InventoriesController {
  constructor(private readonly inventories: InventoriesService) {}

  @Get()
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Инвентаризации' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListInventoriesQuery) {
    return this.inventories.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Инвентаризация с расхождениями' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventories.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Начать инвентаризацию (черновик) или сразу провести' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateInventoryDto) {
    return this.inventories.create(ctx, dto);
  }

  @Put(':id')
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Обновить подсчёт в черновике' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: InventoryItemsDto,
  ) {
    return this.inventories.update(ctx, id, dto);
  }

  @Post(':id/confirm')
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Провести: остатки доводятся до факта' })
  confirm(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventories.confirm(ctx, id);
  }

  @Post(':id/cancel')
  @RequirePermissions(Permission.INVENTORY_MANAGE)
  @ApiOperation({ summary: 'Отменить черновик' })
  cancel(@CurrentAuth() ctx: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.inventories.cancel(ctx, id);
  }
}

@Module({ controllers: [InventoriesController], providers: [InventoriesService] })
export class InventoriesModule {}
