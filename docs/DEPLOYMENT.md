# Деплой MyShop — пошаговая инструкция (ручной деплой)

Целевая схема:

```
Telegram ──► Bot (grammY)          ── кнопка "Открыть MyShop" ──┐
                                                                ▼
Пользователь ──► Vercel: apps/web (Next.js Mini App) ── HTTPS ──► Render: apps/api (NestJS)
                                                                   │
                                                                   ▼
                                                   Supabase: PostgreSQL (Session pooler)
```

Порядок важен: **1. Supabase → 2. Render (API) → 3. Vercel (Web) → 4. связать CORS → 5. Telegram**.
Сначала нужен адрес API, чтобы собрать фронтенд, затем адрес фронтенда, чтобы разрешить его в CORS.

> Время: ~30–40 минут. Все сервисы имеют бесплатные тарифы, ограничения описаны ниже.

---

## 0. Подготовка

1. Код должен быть в GitHub (репозиторий `myshop`), ветка для production — `main`.
2. Локально всё проходит проверки:
   ```bash
   pnpm install
   pnpm lint && pnpm typecheck && pnpm test && pnpm build
   ```
3. Заведите аккаунты: [supabase.com](https://supabase.com), [render.com](https://render.com),
   [vercel.com](https://vercel.com) — удобнее всего входить через GitHub.
4. Подготовьте менеджер паролей: пароль БД и токен бота — секреты, их нельзя коммитить
   и нельзя класть в переменные с префиксом `NEXT_PUBLIC_`.

---

## 1. Supabase — база данных PostgreSQL

### 1.1 Создать проект

1. Supabase Dashboard → **New project**.
2. **Name:** `myshop`.
3. **Database Password:** нажмите _Generate a password_ и сохраните его.
   Для удобства — пароль без символов `@ : / ? # %` (иначе их придётся URL-кодировать в строке подключения).
4. **Region:** ближайший к Render-региону API. Рекомендуется **Central EU (Frankfurt) — `eu-central-1`**
   (в Render тоже выберем Frankfurt — меньше задержка между API и БД).
5. **Create new project**, дождитесь окончания (1–2 минуты).

### 1.2 Получить строки подключения

1. В проекте нажмите кнопку **Connect** (вверху страницы).
2. Выберите вкладку/тип **Session pooler** (порт **5432**).
   > ⚠️ Не используйте _Direct connection_ (`db.<ref>.supabase.co`) — он работает только по IPv6,
   > а Render подключается по IPv4. Session pooler поддерживает IPv4.
3. Скопируйте URI. Он выглядит так:
   ```
   postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
   ```
4. Подставьте пароль вместо `[YOUR-PASSWORD]` и составьте **две** переменные:

   | Переменная     | Значение                  | Кто использует                      |
   | -------------- | ------------------------- | ----------------------------------- |
   | `DATABASE_URL` | `<URI>?sslmode=no-verify` | API во время работы (node-postgres) |
   | `DIRECT_URL`   | `<URI>?sslmode=require`   | `prisma migrate deploy`             |

   Почему разные `sslmode`: соединение шифруется в обоих случаях. Драйвер node-postgres
   трактует `require` как строгую проверку сертификата, а сертификат Supabase подписан
   собственным CA — поэтому для приложения используется `no-verify` (шифрование без проверки CA).
   Как включить полную проверку сертификата — см. раздел [Усиление безопасности](#усиление-безопасности).

### 1.3 (Необязательно) Проверить подключение с компьютера

```bash
# в корне репозитория, временно подставив значения Supabase в .env
pnpm db:status
```

Миграции применять вручную не нужно — Render сделает это при каждом деплое.

---

## 2. Render — backend API (`apps/api`)

### 2.1 Создать Web Service

1. Render Dashboard → **New +** → **Web Service**.
2. **Git Provider → GitHub** → предоставьте доступ к репозиторию `myshop` → **Connect**.
3. Заполните форму:

   | Поле               | Значение                                                                                                     |
   | ------------------ | ------------------------------------------------------------------------------------------------------------ |
   | **Name**           | `myshop-api` (URL будет `https://myshop-api.onrender.com`, если имя свободно)                                |
   | **Language**       | `Node`                                                                                                       |
   | **Branch**         | `main`                                                                                                       |
   | **Region**         | `Frankfurt (EU Central)` — тот же, что у Supabase                                                            |
   | **Root Directory** | _оставить пустым_ (корень монорепозитория — нужен для workspace-пакетов)                                     |
   | **Build Command**  | `pnpm install --frozen-lockfile --prod=false && pnpm turbo run build --filter=@myshop/api && pnpm db:deploy` |
   | **Start Command**  | `node apps/api/dist/main.js`                                                                                 |
   | **Instance Type**  | `Free` (для старта) или `Starter` (без засыпания)                                                            |

   Что делает Build Command:
   - `pnpm install --prod=false` — ставит и dev-зависимости (TypeScript, Nest CLI, Prisma CLI нужны для сборки,
     а при `NODE_ENV=production` pnpm по умолчанию их пропускает);
   - `turbo run build --filter=@myshop/api` — собирает `shared` → `database` (с `prisma generate`) → `api`;
   - `pnpm db:deploy` — применяет новые миграции к Supabase (`prisma migrate deploy`, безопасно запускать повторно).

### 2.2 Переменные окружения

В той же форме → **Environment Variables** → _Add Environment Variable_ (или позже: _Environment_ в меню сервиса):

| Key                 | Value                                     | Комментарий                                                          |
| ------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `NODE_VERSION`      | `22`                                      | Версия Node.js для сборки и запуска                                  |
| `NODE_ENV`          | `production`                              |                                                                      |
| `DATABASE_URL`      | Session pooler URI + `?sslmode=no-verify` | из шага 1.2 — **секрет**                                             |
| `DIRECT_URL`        | Session pooler URI + `?sslmode=require`   | из шага 1.2 — **секрет**                                             |
| `DATABASE_POOL_MAX` | `5`                                       | Supabase free ограничивает число подключений к пулеру                |
| `CORS_ORIGINS`      | `http://localhost:3001`                   | Временно. После шага 3 заменим на URL Vercel                         |
| `TRUST_PROXY`       | `true`                                    | Render стоит перед приложением как прокси — нужно для rate limit     |
| `SWAGGER_ENABLED`   | `true`                                    | Swagger UI на `/api/docs`. Поставьте `false`, если не нужен публично |

`PORT` задавать **не нужно** — Render передаёт его сам, API слушает `0.0.0.0:$PORT`.

### 2.3 Health check

**Advanced** → **Health Check Path:** `/api/health`

Render не переключит трафик на новую версию, пока этот endpoint не ответит `200`.

### 2.4 Деплой и проверка

1. **Deploy Web Service**. Следите за логами: должно быть `Generated Prisma Client`,
   `All migrations have been successfully applied` (или `No pending migrations`),
   затем `MyShop API (production) listening on port 10000`.
2. Проверьте в браузере или терминале (замените домен на свой):
   ```bash
   curl https://myshop-api.onrender.com/api/health
   # {"status":"ok","service":"myshop-api","version":"0.1.0","environment":"production",...}

   curl https://myshop-api.onrender.com/api/health/ready
   # {"status":"ok","checks":{"database":{"status":"ok","latencyMs":...}},...}
   ```
   Swagger: `https://myshop-api.onrender.com/api/docs`.
3. **Сохраните URL API** — он нужен для Vercel.

### 2.5 (Необязательно) Демо-данные в Supabase

Seed запускается один раз вручную с вашего компьютера:

```bash
DATABASE_URL='<Session pooler URI>?sslmode=no-verify' pnpm db:seed
```

### 2.6 Особенности Render

- **Free-тариф засыпает** после ~15 минут без запросов; первый запрос после сна идёт 30–60 секунд.
  Для реального магазина используйте **Starter** или выше.
- **Автодеплой**: каждый push в `main` пересобирает API. Чтобы не пересобирать API при изменениях
  только во фронтенде: _Settings → Build & Deploy → Build Filters → Included Paths_:
  `apps/api/**`, `packages/shared/**`, `packages/database/**`, `pnpm-lock.yaml`.
- Если в логах `pnpm: command not found` или неверная версия pnpm — добавьте в начало Build Command
  `npm install -g pnpm@10.33.0 && `.
- Альтернатива — Docker: _Language → Docker_, _Dockerfile Path_ `apps/api/Dockerfile`, _Docker Build Context_ `.`.
  Тогда миграции нужно запускать отдельно (Pre-Deploy Command `pnpm db:deploy` доступна на платных тарифах).
- Необязательно: вместо ручной настройки можно использовать Blueprint из `render.yaml`
  (_New + → Blueprint_). Инструкция выше делает то же самое вручную.

---

## 3. Vercel — frontend (`apps/web`)

### 3.1 Импорт проекта

1. Vercel Dashboard → **Add New… → Project** → **Import Git Repository** → выберите `myshop` → **Import**.
2. Настройки проекта:

   | Поле                 | Значение                                                                                                           |
   | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
   | **Project Name**     | `myshop` (URL будет `https://myshop.vercel.app`, если имя свободно)                                                |
   | **Framework Preset** | `Next.js`                                                                                                          |
   | **Root Directory**   | нажмите _Edit_ → выберите **`apps/web`**                                                                           |
   | **Build Command**    | оставить по умолчанию — берётся из `apps/web/vercel.json`: `cd ../.. && pnpm turbo run build --filter=@myshop/web` |
   | **Install Command**  | по умолчанию (Vercel определит pnpm по `pnpm-lock.yaml`)                                                           |
   | **Output Directory** | по умолчанию (`.next`)                                                                                             |

   Build Command из `vercel.json` сначала собирает `packages/shared`, затем Next.js-приложение.

### 3.2 Переменные окружения

**Environment Variables** (для _Production_ и _Preview_):

| Key                            | Value                             | Комментарий                                           |
| ------------------------------ | --------------------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`          | `https://myshop-api.onrender.com` | URL API из шага 2.4, **без** `/api` и без `/` в конце |
| `NEXT_PUBLIC_DEFAULT_LOCALE`   | `ru`                              |                                                       |
| `ENABLE_EXPERIMENTAL_COREPACK` | `1`                               | Vercel возьмёт версию pnpm из `packageManager`        |

> `NEXT_PUBLIC_*` встраиваются в JavaScript при **сборке** и видны всем пользователям.
> Никогда не кладите сюда токены, пароли и строки подключения к БД.
> После изменения этих переменных нужен **Redeploy**.

### 3.3 Деплой

1. **Deploy**. Через 1–2 минуты получите URL, например `https://myshop.vercel.app`.
2. Откройте его. На главной будет карточка «Состояние системы». Пока CORS не настроен,
   «Сервер» покажет **«Недоступен»** — это ожидаемо, исправим на следующем шаге.

---

## 4. Связать frontend и backend (CORS)

1. Render → `myshop-api` → **Environment** → измените:
   ```
   CORS_ORIGINS=https://myshop.vercel.app
   ```
   Несколько адресов — через запятую, **без** `/` в конце:
   ```
   CORS_ORIGINS=https://myshop.vercel.app,https://shop.example.uz
   ```
2. **Save Changes** → Render перезапустит сервис (или _Manual Deploy → Deploy latest commit_).
3. Обновите `https://myshop.vercel.app` — «Сервер» и «База данных» должны быть **«Работает»**.

> Preview-деплои Vercel имеют другие адреса (`myshop-git-<branch>-<team>.vercel.app`).
> Добавляйте их в `CORS_ORIGINS` только при необходимости — не используйте `*`.

---

## 5. Telegram — бот и Mini App

Полная интеграция (проверка подписи `initData`, вход по Telegram, production-авторизация,
webhook-режим бота) — **этап 9**. Сейчас можно подготовить бота и подключить Mini App.

### 5.1 Создать бота

1. Откройте [@BotFather](https://t.me/BotFather) → `/newbot` → имя `MyShop` → username, например `myshop_uz_bot`.
2. Сохраните **токен** (`123456:ABC…`) — это секрет.

### 5.2 Подключить Mini App к боту

В @BotFather:

- `/mybots` → ваш бот → **Bot Settings → Configure Mini App → Enable Mini App** →
  укажите URL `https://myshop.vercel.app` (главная Mini App бота);
- **Bot Settings → Menu Button** → URL `https://myshop.vercel.app`, текст `Открыть MyShop`.

Теперь Mini App открывается кнопкой меню в чате с ботом.

### 5.3 Запуск бота (команды /start и /help)

Бот сейчас работает в режиме **long polling**. Для проверки его можно запустить локально:

```bash
# в .env
TELEGRAM_BOT_TOKEN=123456:ABC...
MINI_APP_URL=https://myshop.vercel.app

pnpm dev:bot
```

Отправьте боту `/start` — он ответит «🛒 MyShop» и кнопкой «Открыть MyShop».

Постоянный хостинг бота на Render (на выбор, настроим на этапе 9):

- **Background Worker** (платный тариф): Build `pnpm install --frozen-lockfile --prod=false && pnpm turbo run build --filter=@myshop/bot`,
  Start `node apps/bot/dist/main.js`, переменные `TELEGRAM_BOT_TOKEN`, `MINI_APP_URL`, `NODE_VERSION=22`;
- **Webhook** внутри Web Service (работает на free-тарифе) — будет добавлен на этапе 9.

> Одновременно может работать только **один** экземпляр бота в режиме polling
> (иначе Telegram вернёт ошибку `409 Conflict`). Не запускайте бота локально, пока он работает на Render.

---

## 6. Чек-лист после деплоя

- [ ] `https://<api>.onrender.com/api/health` → `200`, `"environment":"production"`
- [ ] `https://<api>.onrender.com/api/health/ready` → `200`, `database.status = ok`
- [ ] `https://<web>.vercel.app` → «Сервер: Работает», «База данных: Работает»
- [ ] Переключатель языка RU/UZ работает
- [ ] В Render и Vercel нет секретов в переменных `NEXT_PUBLIC_*`
- [ ] `CORS_ORIGINS` содержит только ваши домены
- [ ] В Supabase: _Table Editor_ показывает таблицы `companies`, `branches`, `_prisma_migrations`
- [ ] (опционально) Бот отвечает на `/start` кнопкой Mini App

## 7. Как выкатывать обновления

1. Работа в ветке → Pull Request → GitHub Actions CI (lint, typecheck, unit, e2e, build) должен быть зелёным.
2. Merge в `main` → Render и Vercel задеплоят автоматически.
3. Новые миграции применятся на Render в Build Command (`pnpm db:deploy`).
   Миграции должны быть **обратно совместимыми**: старая версия API продолжает работать,
   пока новая собирается (добавляйте колонки как nullable / с default, удаляйте в следующем релизе).

## 8. Диагностика

| Симптом                                                     | Причина и решение                                                                              |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Render: `Invalid environment configuration: DATABASE_URL`   | Переменная не задана или не начинается с `postgresql://`                                       |
| Render: `self-signed certificate in certificate chain`      | В `DATABASE_URL` указан `sslmode=require` — замените на `sslmode=no-verify` (или настройте CA) |
| Render: `P1001: Can't reach database server`                | Используется Direct connection (IPv6). Нужен **Session pooler** URI                            |
| Render: `password authentication failed`                    | Неверный пароль или спецсимволы в нём не URL-закодированы                                      |
| Render: `Cannot find module …/dist/main.js`                 | Неверный Start Command или Root Directory не пустой                                            |
| Render: `Max client connections reached`                    | Уменьшите `DATABASE_POOL_MAX` (например, до `3`)                                               |
| Web: «Сервер: Недоступен», в консоли браузера CORS error    | Домен Vercel не добавлен в `CORS_ORIGINS` (без `/` в конце) — сохраните и перезапустите API    |
| Web: запросы идут на `localhost:3000`                       | `NEXT_PUBLIC_API_URL` не задан на Vercel или задан после сборки — сделайте Redeploy            |
| Первый запрос очень долгий                                  | Free-инстанс Render проснулся после сна — ожидаемо на free-тарифе                              |
| Бот: `409 Conflict: terminated by other getUpdates request` | Запущено два экземпляра бота — оставьте один                                                   |

## Усиление безопасности

- **Проверка сертификата Supabase:** скачайте CA-сертификат (_Project Settings → Database → SSL Configuration_),
  добавьте его в Render как **Secret File** (`supabase-ca.crt`, будет доступен как `/etc/secrets/supabase-ca.crt`)
  и используйте `DATABASE_URL=<URI>?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt`.
- В Supabase включите **Enforce SSL on incoming connections** (_Database → Settings_).
- Отключите публичный Swagger в production: `SWAGGER_ENABLED=false`.
- Храните секреты только в панелях Render/Vercel; `.env` в git не попадает (см. `.gitignore`).
