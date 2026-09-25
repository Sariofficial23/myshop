# Roadmap MyShop

После каждого этапа: tests → lint → typecheck → исправления → README/документация → commit.
Следующий этап не начинается, пока текущий не собирается.

| Этап | Содержание                                                                            | Статус    |
| ---- | ------------------------------------------------------------------------------------- | --------- |
| 1    | Repository, monorepo, frontend, backend, database, Docker, environment, health checks | ✅ Готово |
| 2    | Authentication (JWT), Company, Branch, Users, Roles (RBAC)                            | ✅ Готово |
| 3    | Products, Categories, Brands, Variants, Barcode, IMEI/Serial numbers                  | ✅ Готово |
| 4    | Purchase, StockMovement, stock balances                                               | ✅ Готово |
| 5    | Sales, Payments, продажа по IMEI                                                      | ✅ Готово |
| 6    | Returns, Transfers, Inventory                                                         | ✅ Готово |
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

## Этап 3 — что сделано

- Каталог: категории (с вложенностью, защита от циклов), бренды, товары, варианты
  (модель, цвет, память, ОЗУ, прочие характеристики), штрихкоды, цена продажи варианта
- Товар создаётся вместе с вариантами и штрихкодами в одной транзакции; SKU генерируется,
  если не указан; уникальность SKU / штрихкода / IMEI — в пределах компании (unique-индексы)
- Учёт по номеру: без номера / IMEI / серийный номер; модель SerialNumber со статусами
  IN_STOCK, SOLD, RETURNED, TRANSFERRED, WRITTEN_OFF (номера появятся с приходом — этап 4)
- IMEI: проверка формата по алгоритму Луна, проверка дублей, быстрый поиск по IMEI
- Поиск товаров: название, SKU, вариант, штрихкод, IMEI; поиск по отсканированному штрихкоду
- Архитектура сканера: интерфейс BarcodeScanner (камера через BarcodeDetector, ручной ввод,
  USB/Bluetooth-сканер) → строка → backend; бизнес-логика не зависит от библиотеки
- Нарушения unique-индексов → понятные коды (DUPLICATE_SKU, DUPLICATE_BARCODE, DUPLICATE_IMEI…)
- Frontend: вкладка «Склад», список с поиском и фильтром категорий, сканер, IMEI-поиск,
  создание/редактирование товара, варианты, штрихкоды, «Категории и бренды», RU/UZ
- Seed: 5 товаров из ТЗ с категориями, брендами, ценами и штрихкодами

## Этап 4 — что сделано

- Приход: черновик → проведение (или сразу `confirm: true`) → отмена черновика; сквозная
  нумерация ПР-1, ПР-2…; поставщик, номер накладной
- Проведение атомарно: движения PURCHASE, остатки, средневзвешенная себестоимость, IMEI /
  серийные номера (IN_STOCK), новая цена продажи, запись в журнал аудита
- Проверки IMEI: количество = количеству товара, формат (Луна), дубли в документе и в базе
- `StockService.applyMovement` — единственное место изменения остатка: блокирует строку
  остатка (`SELECT … FOR UPDATE`), не допускает отрицательного остатка (+ CHECK в БД),
  хранит остаток после движения; повторное/параллельное проведение невозможно
- API только на чтение остатков (`/stock`, `/stock/movements`) — изменить остаток напрямую нельзя
- Поставщики (минимально), журнал аудита (запись; просмотр — этап 8)
- Frontend: «Склад» → Товары / Остатки / Приходы, новый приход с поиском/сканером товара и
  вводом/сканированием IMEI, проведение, история движений в карточке товара, «Заканчиваются»
  и «+ Приход» на главной, поставщики
- Демо-данные: `pnpm demo:data` — 2 проведённых прихода демо-компании через те же сервисы

## Этап 5 — что сделано

- Продажа — одна транзакция: проверка филиала, клиента, товаров, цен и скидок → `StockMovement SALE`
  (остаток не уходит в минус) → IMEI `IN_STOCK → SOLD` условным обновлением (параллельная продажа
  одного IMEI невозможна) → гарантия по IMEI (срок из товара) → платежи → журнал аудита
- Нумерация ПД-1, ПД-2…; себестоимость строки фиксируется на момент продажи (средневзвешенная)
- Оплата: наличные, карта, перевод, смешанная (несколько платежей); сумма платежей должна точно
  совпадать с суммой к оплате (`PAYMENT_MISMATCH`). Рассрочка и долги — этап 7
- Цена: продавец продаёт по цене из карточки, изменить её может только роль с `products.manage`
  (`PRICE_CHANGE_FORBIDDEN`); скидка суммой на строку, не больше суммы строки (`DISCOUNT_TOO_LARGE`)
- Себестоимость и валовая прибыль в ответах API — только при праве `reports.view`
- Клиенты (минимально): поиск по имени/телефону, создание, изменение, скрытие; телефон уникален
  в компании (`DUPLICATE_CUSTOMER_PHONE`)
- API: `GET/POST /sales`, `GET /sales/:id`, `GET /payments`, `GET/POST/PATCH /customers`,
  `GET /serial-numbers?variantId&branchId` (IMEI в наличии)
- CHECK-ограничения БД на суммы продаж, строк и платежей
- Frontend: вкладка «Продажа» (корзина, выбор/скан IMEI из наличия, скидка, клиент, способы оплаты,
  контроль распределения смешанной оплаты), чек с IMEI и сроком гарантии, история продаж,
  «+ Продажа» на главной, «Ещё» → Клиенты / Поставщики, RU/UZ

## Этап 6 — что сделано

- Возврат по чеку (ВЗ-n): строки чека блокируются (`SELECT … FOR UPDATE`), вернуть можно не больше
  проданного минус уже возвращённое (`RETURN_LIMIT_EXCEEDED`, + CHECK в БД); сумма — пропорционально
  строке со скидкой, последний возврат забирает остаток суммы (копейки не теряются);
  IMEI должен быть продан этой строкой → снова `IN_STOCK`; `StockMovement RETURN` по себестоимости
  продажи; выплата клиенту (наличные/карта/перевод); статус продажи PARTIALLY_RETURNED / RETURNED;
  прибыль продажи учитывает возвраты
- Перемещение (ПМ-n): `TRANSFER_OUT` из своего филиала по средней себестоимости + `TRANSFER_IN`
  в любой филиал компании; IMEI меняют филиал условным обновлением; `/branches/transfer-targets`
- Списание (СП-n): причина (брак, порча, утеря, другое), `WRITE_OFF`, IMEI → `WRITTEN_OFF`
- Инвентаризация (ИН-n): черновик → сверка (учёт/факт/разница) → проведение; остаток блокируется
  и доводится до факта `INVENTORY_ADJUSTMENT` (излишек — по текущей средней себестоимости);
  найденные IMEI должны быть в наличии филиала, ненайденные → `WRITTEN_OFF`; частичная инвентаризация
- Общие проверки строк документа: без повторов (`DUPLICATE_DOCUMENT_ITEM`), IMEI только из наличия
  филиала (`SERIAL_NOT_IN_STOCK`); всё в одной транзакции с журналом аудита
- История движений товара ссылается на документ-источник любого типа
- Frontend: возврат из чека, чек с возвращёнными IMEI и списком возвратов; «Склад» →
  Перемещения / Списания / Инвентаризация (списки, создание, карточки), RU/UZ

## Модели БД по этапам

| Этап | Модели                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 1    | Company, Branch                                                                                             |
| 2    | ✅ User, Membership (роль, права), MembershipBranch (доступ к филиалам), Session                            |
| 3    | ✅ Category, Brand, Product, ProductVariant, Barcode, SerialNumber                                          |
| 4    | ✅ Supplier, Purchase, PurchaseItem, StockMovement, StockBalance, DocumentCounter, AuditLog                 |
| 5    | ✅ Customer (минимум), Sale, SaleItem, Payment                                                              |
| 6    | ✅ SaleReturn, ReturnItem, Refund, Transfer, TransferItem, WriteOff, WriteOffItem, Inventory, InventoryItem |
| 7    | Customer/Supplier (полностью), CashOperation, Installment, InstallmentPayment, Warranty                     |
| 8    | AuditLog (+ отчёты поверх существующих моделей)                                                             |

Seed будет расширяться на каждом этапе: пользователи Owner/Manager/Seller/Warehouse (этап 2),
товары iPhone 15 128GB Black, Samsung Galaxy A56, Redmi Note, LG TV 55, AirPods (этап 3),
демонстрационные приходы (этап 4) и продажи (этап 5) — только через документы со StockMovement.
