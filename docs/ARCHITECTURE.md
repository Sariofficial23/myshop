# Архитектура MyShop

## Принципы

1. **Backend — единственный источник бизнес-логики.** `apps/web` и `apps/bot` только
   отображают данные и вызывают REST API. Права (RBAC), изоляция компаний, проверки
   остатков и IMEI выполняются только на сервере.
2. **Multi-tenant.** Все бизнес-данные привязаны к `Company`. Каждый запрос к БД
   фильтруется по `companyId` пользователя из сессии, никогда — из тела запроса.
3. **Остаток = история движений.** Никаких ручных правок stock: только документы
   (приход, продажа, возврат, перемещение, списание, инвентаризация), каждый создаёт
   `StockMovement` внутри транзакции.
4. **Понятные ошибки.** API отвечает машиночитаемым кодом (`INSUFFICIENT_STOCK`, …),
   frontend переводит код в сообщение на языке пользователя.
5. **Локализация с первого дня.** Ни одной строки интерфейса в коде компонентов —
   только ключи переводов (`apps/web/messages/{ru,uz}.json`).

## Пакеты и зависимости

```
apps/web  ──► packages/ui
    │     ──► packages/shared
    │
    └──── HTTP (REST, JSON) ───►  apps/api ──► packages/database ──► PostgreSQL
                                     │     ──► packages/shared
apps/bot  ── Telegram Bot API        │
          (кнопка открывает web) ────┘ (этап 9: авторизация через initData → API)
```

| Пакет               | Ответственность                                                          | Сборка                           |
| ------------------- | ------------------------------------------------------------------------ | -------------------------------- |
| `packages/shared`   | Коды ошибок, формат ошибки API, роли, типы движений, локали, типы health | `tsc` → `dist` (ESM)             |
| `packages/database` | `schema.prisma`, миграции, seed, `createPrismaClient()`                  | `prisma generate` + `tsc`        |
| `packages/ui`       | React-компоненты (Button, Card, StatusBadge) на Tailwind                 | исходники, транспилирует Next.js |
| `apps/api`          | NestJS REST API                                                          | `nest build` → `dist`            |
| `apps/web`          | Next.js Mini App                                                         | `next build`                     |
| `apps/bot`          | grammY-бот                                                               | `tsc` → `dist`                   |

Turborepo строит зависимости в правильном порядке (`dependsOn: ["^build"]`).

## Backend (apps/api)

```
src/
├── main.ts                     bootstrap, слушает 0.0.0.0:$PORT
├── app.module.ts               Config (валидация env), Throttler, Prisma, модули
├── app.setup.ts                общая настройка (используется и в e2e-тестах):
│                               helmet, CORS allow-list, /api prefix, ValidationPipe,
│                               фильтр ошибок, Swagger, trust proxy, request id
├── config/env.ts               zod-схема переменных окружения
├── prisma/                     PrismaService (глобальный модуль)
├── common/errors/              AppException, AllExceptionsFilter, ошибки валидации
├── common/http/                X-Request-Id middleware
└── health/                     GET /api/health, GET /api/health/ready
```

Будущие модули (этапы 2–8) повторяют REST-структуру из ТЗ:
`/auth /companies /branches /users /products /categories /brands /suppliers /customers
/purchases /sales /returns /transfers /inventory /stock /payments /installments
/warranties /cash /reports /audit`.

### Формат ошибки

```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "Not enough stock",
    "details": { "available": 1 }
  },
  "statusCode": 409,
  "path": "/api/sales",
  "timestamp": "2026-09-24T10:00:00.000Z",
  "requestId": "9f0c…"
}
```

- Бизнес-ошибки: `throw new AppException(ErrorCode.X, HttpStatus.Y, 'message', details)`.
- Ошибки валидации DTO → `VALIDATION_ERROR` + список полей в `details`.
- Prisma `P2002` (unique) → `409 CONFLICT`, `P2025` → `404 NOT_FOUND`.
- Неизвестные ошибки → `500 INTERNAL_ERROR` без утечки внутренних деталей.

### Health checks

| Endpoint                | Назначение                                   | Ответ                           |
| ----------------------- | -------------------------------------------- | ------------------------------- |
| `GET /api/health`       | liveness — процесс жив (Render health check) | `200 {status, version, uptime}` |
| `GET /api/health/ready` | readiness — БД доступна (`SELECT 1`)         | `200` или `503`                 |

Health-эндпоинты исключены из rate limiting.

## Frontend (apps/web)

- App Router, серверные компоненты для разметки, клиентские — для данных (TanStack Query).
- `src/lib/api/client.ts` — единственная точка вызова API; ошибки → `ApiError` с кодом.
- `src/i18n/` — next-intl без префикса языка в URL (язык в cookie `NEXT_LOCALE`).
  На этапе 9 язык будет браться из профиля пользователя / Telegram `language_code`.
- Mobile-first: `max-w-md`, кнопки ≥ 48px, `viewport-fit=cover` для Telegram.
- Секреты во frontend запрещены: только `NEXT_PUBLIC_*` переменные.

## База данных (packages/database)

- PostgreSQL + Prisma 7 с driver adapter `@prisma/adapter-pg` (без бинарного query engine).
- Соглашения: `uuid` PK, `snake_case` таблицы/колонки через `@@map/@map`,
  `created_at`/`updated_at` (`timestamptz`) у всех важных сущностей, индексы по `company_id`.
- `DATABASE_URL` — runtime (пул приложения), `DIRECT_URL` — миграции.
- Этап 1: `Company`, `Branch`. Этап 2: `User`, `Membership`, `MembershipBranch`, `Session`.
  Модели следующих этапов — см. [ROADMAP.md](ROADMAP.md).
- Этап 3: `Category`, `Brand`, `Product` → `ProductVariant` → `Barcode`, `SerialNumber`.
  Остатки, цены, штрихкоды и IMEI привязаны к **варианту** (у товара без вариантов — один вариант).
  SKU, штрихкод и IMEI уникальны в пределах компании; нарушение unique-индекса возвращается
  понятным кодом (`DUPLICATE_SKU`, `DUPLICATE_BARCODE`, `DUPLICATE_IMEI`).
- `User` — человек (глобально, по `telegram_id`); `Membership` — его роль в конкретной компании.
  Один пользователь может работать в нескольких магазинах и переключаться между ними.

## Авторизация и доступ (этап 2)

```
Telegram Mini App ── initData (подписан Telegram) ──► POST /api/auth/telegram
                                                        │ HMAC-SHA256(bot token) + auth_date
                                                        ▼
                         User(telegram_id) → Membership(company, role) → Session
                                                        │
          ◄── accessToken (JWT 15 мин: sub, sid) + refreshToken (30 дней, ротация) ──┘

Каждый запрос: Bearer JWT → JwtAuthGuard → Session + Membership из БД → AuthContext
               → PermissionsGuard (@RequirePermissions) → сервис (фильтр по ctx.companyId)
```

- `AuthContext` (`apps/api/src/auth/auth-context.ts`): `companyId`, `role`, `permissions`,
  `allBranches`, `branchIds`. Сервисы **обязаны** фильтровать данные по `ctx.companyId`
  и проверять филиал через `assertBranchAccess` / `accessibleBranchWhere`.
- Права ролей и дополнительные права — `packages/shared/src/permissions.ts`
  (один источник для backend и frontend; frontend только скрывает кнопки).
- Эндпоинты без авторизации помечаются `@Public()` (health, вход).

## Безопасность (заложено на этапе 1)

- helmet (security headers), `x-powered-by` отключён
- CORS allow-list из `CORS_ORIGINS`
- Rate limiting (`@nestjs/throttler`), `trust proxy` для корректного IP за Render
- Глобальная валидация DTO (`whitelist`, `forbidNonWhitelisted`)
- Валидация env при старте (zod), секреты только в переменных окружения
- `X-Request-Id` для трассировки
- Docker-образы запускаются от непривилегированного пользователя `node`

Этап 2 добавил JWT-сессии, проверку подписи Telegram `initData`, RBAC-guards,
изоляцию компаний и доступ к филиалам. Audit log — этап 8.
