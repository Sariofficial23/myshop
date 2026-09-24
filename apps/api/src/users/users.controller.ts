import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateUserDto, UpdateUserDto } from './users.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(Permission.USERS_VIEW)
  @ApiOperation({ summary: 'Сотрудники компании' })
  list(@CurrentAuth() ctx: AuthContext) {
    return this.users.list(ctx);
  }

  @Get(':id')
  @RequirePermissions(Permission.USERS_VIEW)
  @ApiOperation({ summary: 'Сотрудник' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Добавить сотрудника' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateUserDto) {
    return this.users.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.USERS_MANAGE)
  @ApiOperation({ summary: 'Изменить роль, филиалы, права или заблокировать сотрудника' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(ctx, id, dto);
  }
}
