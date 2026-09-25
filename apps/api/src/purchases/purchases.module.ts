import { Module } from '@nestjs/common';
import { SuppliersModule } from '../suppliers/suppliers.js';
import { PurchasesController } from './purchases.controller.js';
import { PurchasesService } from './purchases.service.js';

@Module({
  imports: [SuppliersModule],
  controllers: [PurchasesController],
  providers: [PurchasesService],
})
export class PurchasesModule {}
