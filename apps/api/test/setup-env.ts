// Выполняется до импорта тестов: ConfigModule валидирует окружение при загрузке AppModule.
Object.assign(process.env, {
  NODE_ENV: 'test',
  CORS_ORIGINS: 'http://localhost:3001',
  JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-42',
  TELEGRAM_BOT_TOKEN: '123456:TEST_TOKEN_abcdefghijklmnopqrstuvwxyz',
  AUTH_DEV_LOGIN_ENABLED: 'true',
  THROTTLE_ENABLED: 'false',
  PLATFORM_ADMIN_TELEGRAM_IDS: '777000111',
});
