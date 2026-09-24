# 🛒 MyShop

SaaS-система учёта для магазинов телефонов, бытовой техники, электроники и аксессуаров,
работающая внутри **Telegram Mini App**: продажи, склад, IMEI/серийные номера, приходы,
перемещения, инвентаризация, касса, рассрочки, гарантии и отчёты.

> **Статус:** ✅ Этап 1 — инфраструктура (monorepo, frontend, backend, database, Docker,
> environment, health checks). План этапов — [docs/ROADMAP.md](docs/ROADMAP.md).

## Стек

| Слой       | Технологии                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------ |
| Frontend   | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, next-intl (RU/UZ), TanStack Query |
| Backend    | NestJS 12, REST, class-validator, Swagger/OpenAPI, helmet, rate limiting                         |
| Database   | PostgreSQL, Prisma ORM 7 (driver adapter `@prisma/adapter-pg`)                                   |
| Telegram   | grammY (бот), Telegram Mini App SDK (этап 9)                                                     |
| Monorepo   | pnpm workspaces + Turborepo                                                                      |
| Tooling    | Vitest, oxlint, Prettier, GitHub Actions, Docker                                                 |
| Deployment | Frontend → Vercel · Backend → Render · PostgreSQL → Supabase                                     |

## Структура

```
myshop/
├── apps/
│   ├── api/        NestJS REST API — единственный источник бизнес-логики
│   ├── web/        Next.js Mini App — только UI и вызовы API
│   └── bot/        grammY-бот — /start, /help, кнопка «Открыть MyShop»
├── packages/
│   ├── database/   Prisma schema, миграции, seed, типизированный Prisma Client
│   ├── shared/     Общие типы и константы: коды ошибок, роли, типы движений товара
│   └── ui/         Общие React-компоненты (mobile-first, крупные touch targets)
├── docs/           Архитектура, деплой, roadmap
├── docker-compose.yml
├── render.yaml     (необязательный) Render Blueprint
└── .env.example
```

Подробнее — [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Быстрый старт (локально)

Требования: **Node.js ≥ 22.12**, **pnpm 10** (`corepack enable`), **PostgreSQL 16+** или Docker.

```bash
# 1. Зависимости
corepack enable
pnpm install

# 2. Переменные окружения (один корневой .env для всех приложений)
cp .env.example .env

# 3. PostgreSQL (если нет своего)
docker compose up -d db

# 4. Миграции и демо-данные
pnpm db:deploy     # или pnpm db:migrate — в режиме разработки схемы
pnpm db:seed

# 5. Запуск API (http://localhost:3000) и Web (http://localhost:3001)
pnpm dev
```

- Web: http://localhost:3001 — главная страница показывает состояние сервера и базы данных.
- API health: http://localhost:3000/api/health и http://localhost:3000/api/health/ready
- Swagger UI: http://localhost:3000/api/docs

Бот запускается отдельно, когда в `.env` заданы `TELEGRAM_BOT_TOKEN` и `MINI_APP_URL` (https):

```bash
pnpm dev:bot
```

### Всё в Docker

```bash
docker compose --profile app up --build     # db + migrate + api (:3000) + web (:3001)
docker compose --profile bot up --build     # + Telegram-бот (нужен TELEGRAM_BOT_TOKEN в .env)
```

## Команды

| Команда           | Что делает                              |
| ----------------- | --------------------------------------- |
| `pnpm dev`        | API + Web в режиме разработки           |
| `pnpm dev:bot`    | Telegram-бот (long polling)             |
| `pnpm build`      | Production-сборка всех пакетов          |
| `pnpm lint`       | oxlint (warnings = ошибка)              |
| `pnpm typecheck`  | Проверка типов TypeScript               |
| `pnpm test`       | Unit-тесты (Vitest)                     |
| `pnpm test:e2e`   | Интеграционные тесты API (нужна БД)     |
| `pnpm check`      | lint + typecheck + test                 |
| `pnpm format`     | Prettier                                |
| `pnpm db:migrate` | Создать/применить миграцию (разработка) |
| `pnpm db:deploy`  | Применить миграции (production)         |
| `pnpm db:seed`    | Демо-данные (идемпотентно)              |
| `pnpm db:studio`  | Prisma Studio                           |

## Переменные окружения

Полный список с комментариями — [.env.example](.env.example).

| Переменная                          | Где           | Описание                                              |
| ----------------------------------- | ------------- | ----------------------------------------------------- |
| `DATABASE_URL`                      | api, database | PostgreSQL для приложения (Supabase — Session pooler) |
| `DIRECT_URL`                        | database      | PostgreSQL для миграций                               |
| `DATABASE_POOL_MAX`                 | api           | Размер пула соединений (по умолчанию 10)              |
| `PORT`                              | api           | Порт API (Render задаёт сам)                          |
| `CORS_ORIGINS`                      | api           | Разрешённые origin фронтенда через запятую            |
| `SWAGGER_ENABLED`                   | api           | Swagger в production (по умолчанию выключен)          |
| `TRUST_PROXY`                       | api           | `true` за прокси (Render)                             |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT` | api           | Rate limiting                                         |
| `TELEGRAM_BOT_TOKEN`                | bot           | Токен от @BotFather (секрет)                          |
| `MINI_APP_URL`                      | bot           | HTTPS-адрес фронтенда                                 |
| `NEXT_PUBLIC_API_URL`               | web           | URL API (публичный, попадает в браузер)               |
| `NEXT_PUBLIC_DEFAULT_LOCALE`        | web           | `ru` или `uz`                                         |

API валидирует окружение при старте и не запустится с некорректной конфигурацией.

## Деплой

Пошаговая инструкция для ручного деплоя: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**
(Supabase → Render → Vercel → Telegram).

## Главное бизнес-правило

Остаток товара **никогда** не меняется напрямую. Каждое изменение — это `StockMovement`
с источником-документом: `PURCHASE`, `SALE`, `RETURN`, `TRANSFER_IN`, `TRANSFER_OUT`,
`WRITE_OFF`, `INVENTORY_ADJUSTMENT`.
