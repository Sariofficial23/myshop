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
import { ErrorCode, Permission } from '@myshop/shared';
import type { Prisma } from '@myshop/database';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const emptyToNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** Телефон храним в одном формате: только "+" и цифры — так поиск и уникальность надёжны. */
const normalizePhone = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[^\d+]/g, '') || null : value;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Алишер Каримов' })
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  name: string;

  @ApiPropertyOptional({ example: '+998901234567' })
  @IsOptional()
  @Transform(normalizePhone)
  @Matches(/^\+?\d{5,15}$/)
  phone?: string | null;

  @ApiPropertyOptional({ example: '123456789' })
  @IsOptional()
  @Transform(emptyToNull)
  @Matches(/^\d{1,20}$/)
  telegramId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class UpdateCustomerDto extends CreateCustomerDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(1, 200)
  declare name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CustomersQuery {
  @ApiPropertyOptional({ description: 'Имя или телефон' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

const customerSelect = {
  id: true,
  name: true,
  phone: true,
  telegramId: true,
  notes: true,
  isActive: true,
  createdAt: true,
} as const;

type CustomerRow = Prisma.CustomerGetPayload<{ select: typeof customerSelect }>;
const toResponse = (c: CustomerRow) => ({ ...c, telegramId: c.telegramId?.toString() ?? null });

/** Клиенты (минимально для продаж). История покупок, долги, рассрочки — этап 7. */
@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: AuthContext, q?: string) {
    const digits = q?.replace(/\D/g, '');
    const rows = await this.prisma.customer.findMany({
      where: {
        companyId: ctx.companyId,
        isActive: true,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                ...(digits && digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      },
      select: customerSelect,
      orderBy: { name: 'asc' },
      take: 50,
    });
    return rows.map(toResponse);
  }

  async create(ctx: AuthContext, dto: CreateCustomerDto) {
    const row = await this.prisma.customer.create({
      data: {
        companyId: ctx.companyId,
        name: dto.name,
        phone: dto.phone ?? null,
        telegramId: dto.telegramId ? BigInt(dto.telegramId) : null,
        notes: dto.notes ?? null,
      },
      select: customerSelect,
    });
    return toResponse(row);
  }

  async update(ctx: AuthContext, id: string, dto: UpdateCustomerDto) {
    await this.assertInCompany(ctx, id);
    const { telegramId, ...rest } = dto;
    const row = await this.prisma.customer.update({
      where: { id },
      data: {
        ...rest,
        ...(telegramId !== undefined ? { telegramId: telegramId ? BigInt(telegramId) : null } : {}),
      },
      select: customerSelect,
    });
    return toResponse(row);
  }

  async assertInCompany(ctx: AuthContext, id: string): Promise<void> {
    const found = await this.prisma.customer.count({ where: { id, companyId: ctx.companyId } });
    if (!found) {
      throw new AppException(
        ErrorCode.CUSTOMER_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Customer not found',
      );
    }
  }
}

@ApiTags('customers')
@ApiBearerAuth()
@Controller('customers')
@RequirePermissions(Permission.CUSTOMERS_MANAGE)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @ApiOperation({ summary: 'Клиенты: поиск по имени и телефону' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: CustomersQuery) {
    return this.customers.list(ctx, query.q);
  }

  @Post()
  @ApiOperation({ summary: 'Добавить клиента' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateCustomerDto) {
    return this.customers.create(ctx, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Изменить клиента' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(ctx, id, dto);
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
