import path from 'node:path';
import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const monorepoRoot = path.resolve(process.cwd(), '../..');

// Локально переменные берутся из корневого .env монорепозитория (уже заданные не перезаписываются).
// На Vercel они задаются в Project Settings → Environment Variables.
// (@next/env здесь не подходит: Next.js уже загрузил env для apps/web и кеширует результат.)
loadDotenv({ path: path.join(monorepoRoot, '.env'), quiet: true });

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Standalone-сборка нужна только для Docker-образа; Vercel собирает по-своему.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ['@myshop/ui'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Mini App открывается внутри Telegram (в т.ч. web.telegram.org во iframe)
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org",
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
