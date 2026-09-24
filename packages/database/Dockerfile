# Одноразовый контейнер: применяет миграции Prisma (prisma migrate deploy).
# Используется в docker-compose как сервис "migrate".
FROM node:22-alpine
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @myshop/database...
CMD ["pnpm", "--filter", "@myshop/database", "db:deploy"]
