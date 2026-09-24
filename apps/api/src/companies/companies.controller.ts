import { Body, Controller, Get, HttpStatus, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ErrorCode, Permission } from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { AppException } from '../common/errors/app.exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCompanyDto } from './companies.dto.js';

const companySelect = {
  id: true,
  name: true,
  currency: true,
  timezone: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Компания всегда берётся из сессии — нельзя прочитать или изменить чужую компанию по id. */
@ApiTags('companies')
@ApiBearerAuth()
@Controller('companies')
export class CompaniesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('current')
  @ApiOperation({ summary: 'Текущая компания пользователя' })
  async current(@CurrentAuth() ctx: AuthContext) {
    const company = await this.prisma.company.findUnique({
      where: { id: ctx.companyId },
      select: companySelect,
    });
    if (!company) {
      throw new AppException(
        ErrorCode.COMPANY_NOT_FOUND,
        HttpStatus.NOT_FOUND,
        'Company not found',
      );
    }
    return company;
  }

  @Patch('current')
  @RequirePermissions(Permission.COMPANY_MANAGE)
  @ApiOperation({ summary: 'Изменить настройки компании (только владелец)' })
  update(@CurrentAuth() ctx: AuthContext, @Body() dto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id: ctx.companyId },
      data: dto,
      select: companySelect,
    });
  }
}
