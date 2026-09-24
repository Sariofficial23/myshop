import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    // e2e-тесты работают с реальной БД — не запускаем файлы параллельно
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
