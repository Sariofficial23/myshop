import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.js';
import { PaymentsController, SalesController } from './sales.controller.js';
import { SalesService } from './sales.service.js';

@Module({
  imports: [CustomersModule],
  controllers: [SalesController, PaymentsController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
