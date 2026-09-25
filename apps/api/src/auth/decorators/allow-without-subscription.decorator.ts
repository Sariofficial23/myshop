import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_SUBSCRIPTION_KEY = 'auth:allowWithoutSubscription';

/** Эндпоинт доступен и без активной подписки (профиль, выход) — чтобы показать экран ожидания. */
export const AllowWithoutSubscription = () => SetMetadata(ALLOW_WITHOUT_SUBSCRIPTION_KEY, true);
