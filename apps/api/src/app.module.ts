import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from './audit/audit.module.js';
import { AuthModule } from './auth/auth.module.js';
import { BranchesModule } from './branches/branches.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { CompaniesModule } from './companies/companies.module.js';
import { CustomersModule } from './customers/customers.js';
import { type Env, validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PurchasesModule } from './purchases/purchases.module.js';
import { SalesModule } from './sales/sales.module.js';
import { StockModule } from './stock/stock.module.js';
import { SuppliersModule } from './suppliers/suppliers.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Локально: apps/api/.env или корневой .env монорепозитория.
      // На Render переменные задаются в панели и файлы не нужны.
      envFilePath: ['.env', '../../.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [
          {
            ttl: config.get('THROTTLE_TTL_MS', { infer: true }),
            limit: config.get('THROTTLE_LIMIT', { infer: true }),
          },
        ],
        skipIf: () => !config.get('THROTTLE_ENABLED', { infer: true }),
      }),
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    BranchesModule,
    UsersModule,
    CatalogModule,
    AuditModule,
    StockModule,
    SuppliersModule,
    PurchasesModule,
    CustomersModule,
    SalesModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
