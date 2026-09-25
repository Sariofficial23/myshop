# 🛒 MyShop

SaaS-система учёта для магазинов телефонов, бытовой техники, электроники и аксессуаров,
работающая внутри **Telegram Mini App**: продажи, склад, IMEI/серийные номера, приходы,
перемещения, инвентаризация, касса, рассрочки, гарантии и отчёты.

> **Статус:** ✅ Этап 1 — инфраструктура · ✅ Этап 2 — вход через Telegram, компании, филиалы,
> сотрудники и роли (RBAC) · ✅ Этап 3 — каталог: товары, варианты, штрихкоды, IMEI ·
> ✅ Этап 4 — приходы, движения товара и остатки · ✅ Этап 5 — продажи, оплаты, продажа по IMEI ·
> ✅ Этап 6 — возвраты, перемещения, списания, инвентаризация ·
> ✅ Этап 7 — рассрочки, касса, гарантия, карточки клиентов и поставщиков · отчёт о продажах.
> План этапов — [docs/ROADMAP.md](docs/ROADMAP.md).

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
pnpm build && pnpm demo:data   # демо-приходы (остатки и IMEI) через сервисы API

# 5. Запуск API (http://localhost:3000) и Web (http://localhost:3001)
pnpm dev
```

- Web: http://localhost:3001 — вне Telegram показывается экран «Вход для разработки»
  с демо-сотрудниками (Owner, Manager, Seller, Warehouse), если `AUTH_DEV_LOGIN_ENABLED=true`
  и `NEXT_PUBLIC_DEV_LOGIN=true` (так в `.env.example`).
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

| Команда           | Что делает                                            |
| ----------------- | ----------------------------------------------------- |
| `pnpm dev`        | API + Web в режиме разработки                         |
| `pnpm dev:bot`    | Telegram-бот (long polling)                           |
| `pnpm build`      | Production-сборка всех пакетов                        |
| `pnpm lint`       | oxlint (warnings = ошибка)                            |
| `pnpm typecheck`  | Проверка типов TypeScript                             |
| `pnpm test`       | Unit-тесты (Vitest)                                   |
| `pnpm test:e2e`   | Интеграционные тесты API (нужна БД)                   |
| `pnpm check`      | lint + typecheck + test                               |
| `pnpm format`     | Prettier                                              |
| `pnpm db:migrate` | Создать/применить миграцию (разработка)               |
| `pnpm db:deploy`  | Применить миграции (production)                       |
| `pnpm db:seed`    | Демо-данные (идемпотентно)                            |
| `pnpm demo:data`  | Демо-документы через сервисы API (после `pnpm build`) |
| `pnpm db:studio`  | Prisma Studio                                         |

## Переменные окружения

Полный список с комментариями — [.env.example](.env.example).

| Переменная                           | Где           | Описание                                              |
| ------------------------------------ | ------------- | ----------------------------------------------------- |
| `DATABASE_URL`                       | api, database | PostgreSQL для приложения (Supabase — Session pooler) |
| `DIRECT_URL`                         | database      | PostgreSQL для миграций                               |
| `DATABASE_POOL_MAX`                  | api           | Размер пула соединений (по умолчанию 10)              |
| `PORT`                               | api           | Порт API (Render задаёт сам)                          |
| `CORS_ORIGINS`                       | api           | Разрешённые origin фронтенда через запятую            |
| `SWAGGER_ENABLED`                    | api           | Swagger в production (по умолчанию выключен)          |
| `TRUST_PROXY`                        | api           | `true` за прокси (Render)                             |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT`  | api           | Rate limiting                                         |
| `JWT_ACCESS_SECRET`                  | api           | Секрет подписи JWT, ≥ 32 символов (секрет)            |
| `JWT_ACCESS_TTL_SECONDS`             | api           | Время жизни access token (по умолчанию 900)           |
| `REFRESH_TOKEN_TTL_DAYS`             | api           | Время жизни сессии (по умолчанию 30)                  |
| `TELEGRAM_INIT_DATA_MAX_AGE_SECONDS` | api           | Максимальный возраст initData (по умолчанию 86400)    |
| `AUTH_DEV_LOGIN_ENABLED`             | api           | Вход по демо-пользователям (запрещён в production)    |
| `TELEGRAM_BOT_TOKEN`                 | api, bot      | Токен от @BotFather (секрет): проверка initData, бот  |
| `MINI_APP_URL`                       | bot           | HTTPS-адрес фронтенда                                 |
| `NEXT_PUBLIC_API_URL`                | web           | URL API (публичный, попадает в браузер)               |
| `NEXT_PUBLIC_DEFAULT_LOCALE`         | web           | `ru` или `uz`                                         |
| `NEXT_PUBLIC_DEV_LOGIN`              | web           | Показать экран входа для разработки                   |

API валидирует окружение при старте и не запустится с некорректной конфигурацией.

## Вход и роли

- **В Telegram:** Mini App передаёт подписанный `initData` → API проверяет подпись токеном бота
  → находит сотрудника → выдаёт access token (JWT, 15 мин) и refresh token (30 дней, ротируется).
  `telegram_id`, присланный клиентом без подписи, никогда не принимается.
- **Новый пользователь** видит свой Telegram ID (чтобы владелец добавил его как сотрудника)
  или создаёт свой магазин — становится владельцем.
- **Роли:** OWNER, MANAGER, SELLER, WAREHOUSE. Права проверяются на backend на каждом запросе;
  продавцу можно дополнительно выдать право на возвраты и др.
- **Изоляция:** все данные фильтруются по компании из сессии; продавец и склад видят только свои филиалы.

## Продажа (этап 5)

«Продажа» в нижнем меню или «+ Продажа» на главной: найти или отсканировать товар → для товаров
с IMEI отметить номера в наличии филиала → скидка → клиент (необязательно) → способ оплаты
(наличные, карта, перевод или смешанная) → «Продать». Backend в одной транзакции списывает остаток
(`StockMovement SALE`), переводит IMEI в `SOLD` с гарантией, фиксирует себестоимость и платежи.
Продать проданный IMEI или уйти в минус нельзя. Цену меняют только роли с правом `products.manage`,
прибыль видят только роли с правом `reports.view`.

## Возвраты, перемещения, списания, инвентаризация (этап 6)

- **Возврат** — в чеке «Оформить возврат»: отметить IMEI или количество, способ выплаты.
  Сумма считается пропорционально строке чека (со скидкой), вернуть больше проданного нельзя,
  IMEI снова в наличии, прибыль продажи уменьшается. Право `returns.create` (продавцу — по выдаче).
- **Перемещение** — «Склад → Перемещения»: из своего филиала в любой филиал компании,
  IMEI переходят вместе с товаром, себестоимость переносится.
- **Списание** — брак, порча, утеря, другое; IMEI получают статус «списан».
- **Инвентаризация** — черновик с подсчётом → сверка расхождений → проведение: остатки
  доводятся до факта, ненайденные IMEI списываются. Не включённые в документ товары не меняются.

## Отчёты и касса (этап 7)

- **Отчёты** (вкладка внизу): за сегодня / вчера / 7 дней / месяц — на какую сумму продано,
  сколько чеков и товаров, средний чек, прибыль (для владельца и менеджера), возвраты,
  полученные деньги по способам оплаты, что именно продано и на какую сумму, продажи по продавцам.
  На главной — карточка «Сегодня» с суммой продаж за день.
- **Рассрочка** — способ оплаты в продаже: клиент, срок, первоначальный взнос; график платежей,
  приём платежей, просрочка. Возврат товара сначала гасит долг.
- **Касса** — наличные в кассе филиала, итоги дня, внесения / изъятия / расходы.
- **Гарантия** — проверка по IMEI, приём устройства, статусы ремонта.
- Интерфейс в стиле iOS: шрифт San Francisco (на Android/Windows — Inter), иконки-плитки.

## Деплой

Пошаговая инструкция для ручного деплоя: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**
(Supabase → Render → Vercel → Telegram).

## Главное бизнес-правило

Остаток товара **никогда** не меняется напрямую. Каждое изменение — это `StockMovement`
с источником-документом: `PURCHASE`, `SALE`, `RETURN`, `TRANSFER_IN`, `TRANSFER_OUT`,
`WRITE_OFF`, `INVENTORY_ADJUSTMENT`.
