# Roadmap MyShop

После каждого этапа: tests → lint → typecheck → исправления → README/документация → commit.
Следующий этап не начинается, пока текущий не собирается.

| Этап | Содержание                                                                            | Статус    |
| ---- | ------------------------------------------------------------------------------------- | --------- |
| 1    | Repository, monorepo, frontend, backend, database, Docker, environment, health checks | ✅ Готово |
| 2    | Authentication (JWT), Company, Branch, Users, Roles (RBAC)                            | ✅ Готово |
| 3    | Products, Categories, Brands, Variants, Barcode, IMEI/Serial numbers                  | ⏳        |
| 4    | Purchase, StockMovement, stock balances                                               | ⏳        |
| 5    | Sales, Payments, продажа по IMEI                                                      | ⏳        |
| 6    | Returns, Transfers, Inventory                                                         | ⏳        |
| 7    | Customers, Suppliers, Cash, Installments, Warranties                                  | ⏳        |
| 8    | Dashboard, Reports, Audit log                                                         | ⏳        |
| 9    | Telegram bot (webhook), Telegram Mini App SDK (тема, кнопки), приглашения сотрудников | ⏳        |
| 10   | Testing, security review, performance, deployment                                     | ⏳        |

## Этап 1 — что сделано

- pnpm workspaces + Turborepo: `apps/{api,web,bot}`, `packages/{database,shared,ui}`
- `apps/api`: NestJS 12 (ESM), валидация env (zod), helmet, CORS allow-list, rate limiting,
  глобальная валидация DTO, единый формат ошибок с кодами, `X-Request-Id`, Swagger (`/api/docs`),
  health checks `/api/health` и `/api/health/ready`
- `packages/database`: Prisma 7 + `@prisma/adapter-pg`, модели `Company`, `Branch`,
  первая миграция, идемпотентный seed (Demo Electronics / Main Store), поддержка Supabase (`DIRECT_URL`)
- `packages/shared`: `ErrorCode`, `ApiErrorBody`, `Role`, `StockMovementType`, локали, типы health
- `apps/web`: Next.js 16, Tailwind 4, next-intl (RU/UZ), TanStack Query, API-клиент с переводом
  ошибок, страница состояния системы
- `packages/ui`: Button, Card, StatusBadge (mobile-first)
- `apps/bot`: grammY, `/start` и `/help` с кнопкой Mini App, валидация env
- Docker: Dockerfile для api/web/bot/migrate, `docker-compose.yml` (профили `app`, `bot`)
- CI: GitHub Actions (format, lint, typecheck, unit, миграции, seed, e2e, build)
- Документация: README, ARCHITECTURE, DEPLOYMENT (Supabase → Render → Vercel → Telegram)

## Этап 2 — что сделано

- Вход через Telegram Mini App: проверка подписи `initData` (HMAC-SHA256 по токену бота),
  срок годности `auth_date`, профиль обновляется из Telegram
- Сессии: access token (JWT HS256, 15 мин) + refresh token (30 дней, хранится только SHA-256,
  ротация при каждом обновлении, повторное использование старого токена отзывает все сессии)
- Регистрация магазина (SaaS-онбординг): компания + первый филиал + владелец в одной транзакции
- RBAC: права ролей OWNER/MANAGER/SELLER/WAREHOUSE по ТЗ + дополнительные права
  (например, возвраты для продавца); `JwtAuthGuard` + `PermissionsGuard` на всех эндпоинтах
- Роль, права и филиалы читаются из БД на каждом запросе — блокировка и смена роли действуют сразу
- Изоляция компаний: `companyId` берётся только из сессии; чужие данные = «не найдено»
- Доступ к филиалам: `allBranches` или список филиалов у сотрудника
- Правила сотрудников: менеджер назначает только продавцов/склад, нельзя менять себе роль/доступ,
  нельзя выдать право или филиал, которых нет у себя, компания не остаётся без владельца
- Dev-login по демо-пользователям для локальной разработки (запрещён в production)
- Frontend: вход через Telegram, экран «нет магазина» с Telegram ID и созданием магазина,
  нижняя навигация, «Ещё», компания, филиалы, сотрудники (роль, филиалы, права, блокировка), RU/UZ
- API: `/auth/*`, `/companies/current`, `/branches`, `/users`

## Модели БД по этапам

| Этап | Модели                                                                                  |
| ---- | --------------------------------------------------------------------------------------- |
| 1    | Company, Branch                                                                         |
| 2    | ✅ User, Membership (роль, права), MembershipBranch (доступ к филиалам), Session        |
| 3    | Category, Brand, Product, ProductVariant, Barcode, SerialNumber                         |
| 4    | Supplier (минимум), Purchase, PurchaseItem, StockMovement, StockBalance                 |
| 5    | Customer (минимум), Sale, SaleItem, Payment                                             |
| 6    | Return, ReturnItem, Transfer, TransferItem, Inventory, InventoryItem, WriteOff          |
| 7    | Customer/Supplier (полностью), CashOperation, Installment, InstallmentPayment, Warranty |
| 8    | AuditLog (+ отчёты поверх существующих моделей)                                         |

Seed будет расширяться на каждом этапе: пользователи Owner/Manager/Seller/Warehouse (этап 2),
товары iPhone 15 128GB Black, Samsung Galaxy A56, Redmi Note, LG TV 55, AirPods (этап 3),
демонстрационные приходы (этап 4) и продажи (этап 5) — только через документы со StockMovement.
