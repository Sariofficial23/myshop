import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Эндпоинт доступен без авторизации (health, вход). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
