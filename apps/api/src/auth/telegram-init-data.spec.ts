import { describe, expect, it } from 'vitest';
import {
  InitDataError,
  signTelegramInitData,
  validateTelegramInitData,
} from './telegram-init-data.js';

const BOT_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
const NOW = new Date('2026-09-24T12:00:00Z');
const authDate = String(Math.floor(NOW.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 42, first_name: 'Ali', username: 'ali', language_code: 'uz' });

function reason(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof InitDataError ? error.reason : 'other';
  }
  return undefined;
}

describe('validateTelegramInitData', () => {
  const options = { maxAgeSeconds: 3600, now: NOW };

  it('accepts correctly signed data and returns the Telegram user', () => {
    const initData = signTelegramInitData(
      { auth_date: authDate, query_id: 'AAA', user },
      BOT_TOKEN,
    );
    const result = validateTelegramInitData(initData, BOT_TOKEN, options);
    expect(result.user).toMatchObject({ id: 42, first_name: 'Ali', language_code: 'uz' });
    expect(result.queryId).toBe('AAA');
    expect(result.authDate.getTime()).toBe(Number(authDate) * 1000);
  });

  it('includes the optional "signature" field in the check string', () => {
    const initData = signTelegramInitData(
      { auth_date: authDate, user, signature: 'abc' },
      BOT_TOKEN,
    );
    expect(validateTelegramInitData(initData, BOT_TOKEN, options).user.id).toBe(42);
  });

  it('rejects data signed with another bot token', () => {
    const initData = signTelegramInitData(
      { auth_date: authDate, user },
      '999:ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
    );
    expect(reason(() => validateTelegramInitData(initData, BOT_TOKEN, options))).toBe(
      'invalid_signature',
    );
  });

  it('rejects tampered user data (e.g. forged telegram id)', () => {
    const initData = signTelegramInitData({ auth_date: authDate, user }, BOT_TOKEN).replace(
      encodeURIComponent('"id":42'),
      encodeURIComponent('"id":1'),
    );
    expect(reason(() => validateTelegramInitData(initData, BOT_TOKEN, options))).toBe(
      'invalid_signature',
    );
  });

  it('rejects expired data', () => {
    const old = String(Math.floor(NOW.getTime() / 1000) - 7200);
    const initData = signTelegramInitData({ auth_date: old, user }, BOT_TOKEN);
    expect(reason(() => validateTelegramInitData(initData, BOT_TOKEN, options))).toBe('expired');
  });

  it('rejects malformed input', () => {
    expect(reason(() => validateTelegramInitData('', BOT_TOKEN, options))).toBe('malformed');
    expect(reason(() => validateTelegramInitData('user=1', BOT_TOKEN, options))).toBe('malformed');
    expect(reason(() => validateTelegramInitData('hash=zz', BOT_TOKEN, options))).toBe('malformed');
  });

  it('requires a user object', () => {
    const initData = signTelegramInitData({ auth_date: authDate }, BOT_TOKEN);
    expect(reason(() => validateTelegramInitData(initData, BOT_TOKEN, options))).toBe(
      'missing_user',
    );
  });
});
