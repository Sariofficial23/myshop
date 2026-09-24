import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { API_PREFIX, configureApp, SWAGGER_PATH } from './app.setup.js';
import { isSwaggerEnabled } from './config/env.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const env = configureApp(app);

  // 0.0.0.0 — обязательно для Docker и Render
  await app.listen(env.PORT, '0.0.0.0');

  const logger = new Logger('Bootstrap');
  logger.log(`MyShop API (${env.NODE_ENV}) listening on port ${env.PORT}, prefix /${API_PREFIX}`);
  if (isSwaggerEnabled(env)) {
    logger.log(`Swagger UI: /${SWAGGER_PATH}`);
  }
}

await bootstrap();
