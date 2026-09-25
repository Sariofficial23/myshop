import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { KeepAliveService } from './keep-alive.service.js';

@Module({
  controllers: [HealthController],
  providers: [KeepAliveService],
})
export class HealthModule {}
