import { createHmac, timingSafeEqual } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ValidatedInitData {
  user: TelegramUser;
  authDate: Date;
  queryId?: string;
}

export type InitDataErrorReason = 'malformed' | 'invalid_signature' | 'expired' | 'missing_user';

export class InitDataError extends Error {
  constructor(readonly reason: InitDataErrorReason) {
    super(`Invalid Telegram initData: ${reason}`);
  }
}

/**
 * Проверка подписи Telegram Mini App initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 *   secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   hash       = HEX(HMAC_SHA256(key = secret_key, message = data_check_string))
 *
 * data_check_string — все поля, кроме `hash`, отсортированные по ключу, в виде
 * "key=value", соединённые "\n". Никогда не доверяем telegram_id от клиента без этой проверки.
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
  { maxAgeSeconds, now = new Date() }: { maxAgeSeconds: number; now?: Date },
): ValidatedInitData {
  if (!initData || initData.length > 4096) {
    throw new InitDataError('malformed');
  }

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) {
    throw new InitDataError('malformed');
  }
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .toSorted()
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const received = Buffer.from(hash, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new InitDataError('invalid_signature');
  }

  const authDateSeconds = Number(params.get('auth_date'));
  if (!Number.isInteger(authDateSeconds) || authDateSeconds <= 0) {
    throw new InitDataError('malformed');
  }
  const ageSeconds = now.getTime() / 1000 - authDateSeconds;
  // Небольшой допуск на расхождение часов в будущее
  if (ageSeconds > maxAgeSeconds || ageSeconds < -300) {
    throw new InitDataError('expired');
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    throw new InitDataError('missing_user');
  }
  let user: TelegramUser;
  try {
    user = JSON.parse(rawUser) as TelegramUser;
  } catch {
    throw new InitDataError('malformed');
  }
  if (!Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') {
    throw new InitDataError('missing_user');
  }

  return {
    user,
    authDate: new Date(authDateSeconds * 1000),
    queryId: params.get('query_id') ?? undefined,
  };
}

/** Собирает подписанный initData — используется в тестах и для локальной отладки. */
export function signTelegramInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields);
  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .toSorted()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}
