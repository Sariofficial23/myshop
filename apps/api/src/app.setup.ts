import { type INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { APP_VERSION } from './config/app-info.js';
import { type Env, isSwaggerEnabled, validateEnv } from './config/env.js';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter.js';
import { validationExceptionFactory } from './common/errors/validation.js';
import { requestIdMiddleware } from './common/http/request-id.middleware.js';

export const API_PREFIX = 'api';
export const SWAGGER_PATH = `${API_PREFIX}/docs`;

/**
 * Общая настройка приложения — используется и в main.ts, и в e2e-тестах,
 * чтобы тесты проверяли ровно ту конфигурацию, что работает в production.
 */
export function configureApp(app: NestExpressApplication): Env {
  // ConfigModule уже провалидировал окружение и загрузил .env в process.env
  const env = validateEnv(process.env);

  if (env.TRUST_PROXY) {
    // Render / Docker за прокси: реальный IP клиента нужен для rate limiting
    app.set('trust proxy', 1);
  }
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // X-Telegram-Init-Data — подпись Telegram для админ-панели платформы
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'Accept-Language',
      'X-Telegram-Init-Data',
    ],
    exposedHeaders: ['X-Request-Id'],
    maxAge: 600,
  });

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: validationExceptionFactory,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  if (isSwaggerEnabled(env)) {
    setupSwagger(app);
  }
  return env;
}

function setupSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('MyShop API')
      .setDescription('REST API системы учёта магазина электроники MyShop')
      .setVersion(APP_VERSION)
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    jsonDocumentUrl: `${SWAGGER_PATH}-json`,
  });
}
