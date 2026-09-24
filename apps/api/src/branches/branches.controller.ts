import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permission } from '@myshop/shared';
import type { AuthContext } from '../auth/auth-context.js';
import { CurrentAuth } from '../auth/decorators/current-auth.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import { CreateBranchDto, ListBranchesQuery, UpdateBranchDto } from './branches.dto.js';
import { BranchesService } from './branches.service.js';

@ApiTags('branches')
@ApiBearerAuth()
@Controller('branches')
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  @RequirePermissions(Permission.BRANCHES_VIEW)
  @ApiOperation({ summary: 'Филиалы, доступные сотруднику' })
  list(@CurrentAuth() ctx: AuthContext, @Query() query: ListBranchesQuery) {
    return this.branches.list(ctx, query.includeInactive);
  }

  @Get(':id')
  @RequirePermissions(Permission.BRANCHES_VIEW)
  @ApiOperation({ summary: 'Филиал' })
  get(@CurrentAuth() ctx: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.branches.get(ctx, id);
  }

  @Post()
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Создать филиал' })
  create(@CurrentAuth() ctx: AuthContext, @Body() dto: CreateBranchDto) {
    return this.branches.create(ctx, dto);
  }

  @Patch(':id')
  @RequirePermissions(Permission.BRANCHES_MANAGE)
  @ApiOperation({ summary: 'Изменить или отключить филиал' })
  update(
    @CurrentAuth() ctx: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branches.update(ctx, id, dto);
  }
}
