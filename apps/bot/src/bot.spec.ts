import type { Update, UserFromGetMe } from 'grammy/types';
import { describe, expect, it } from 'vitest';
import { createBot } from './bot.js';
import { validateBotEnv } from './env.js';

const TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi';
const MINI_APP_URL = 'https://myshop.vercel.app';

// Минимальный профиль бота: grammY не вызывает getMe, если botInfo задан заранее
const botInfo = {
  id: 1,
  is_bot: true,
  first_name: 'MyShop',
  username: 'myshop_bot',
} as UserFromGetMe;

function commandUpdate(command: string): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: { id: 42, type: 'private', first_name: 'Test' },
      from: { id: 42, is_bot: false, first_name: 'Test' },
      text: `/${command}`,
      entities: [{ type: 'bot_command', offset: 0, length: command.length + 1 }],
    },
  };
}

/** Перехватывает вызовы Telegram Bot API без сети. */
function createTestBot() {
  const bot = createBot({ TELEGRAM_BOT_TOKEN: TOKEN, MINI_APP_URL });
  bot.botInfo = botInfo;
  const calls: Array<{ method: string; payload: Record<string, unknown> }> = [];
  bot.api.config.use(async (_prev, method, payload) => {
    calls.push({ method, payload: payload as Record<string, unknown> });
    return { ok: true, result: true } as never;
  });
  return { bot, calls };
}

describe('bot commands', () => {
  it.each(['start', 'help'])('/%s replies with a Mini App button', async (command) => {
    const { bot, calls } = createTestBot();
    await bot.handleUpdate(commandUpdate(command));

    expect(calls).toHaveLength(1);
    const { method, payload } = calls[0]!;
    expect(method).toBe('sendMessage');
    expect(payload.chat_id).toBe(42);
    expect(payload.reply_markup).toEqual({
      inline_keyboard: [[{ text: 'Открыть MyShop', web_app: { url: MINI_APP_URL } }]],
    });
  });

  it('/start greets with MyShop title', async () => {
    const { bot, calls } = createTestBot();
    await bot.handleUpdate(commandUpdate('start'));
    expect(String(calls[0]!.payload.text)).toContain('🛒 <b>MyShop</b>');
  });
});

describe('validateBotEnv', () => {
  it('accepts valid configuration', () => {
    expect(validateBotEnv({ TELEGRAM_BOT_TOKEN: TOKEN, MINI_APP_URL }).MINI_APP_URL).toBe(
      MINI_APP_URL,
    );
  });

  it('requires https Mini App URL', () => {
    expect(() =>
      validateBotEnv({ TELEGRAM_BOT_TOKEN: TOKEN, MINI_APP_URL: 'http://localhost:3001' }),
    ).toThrow(/https/);
  });

  it('rejects missing or malformed token', () => {
    expect(() => validateBotEnv({ MINI_APP_URL })).toThrow(/TELEGRAM_BOT_TOKEN/);
    expect(() => validateBotEnv({ TELEGRAM_BOT_TOKEN: 'abc', MINI_APP_URL })).toThrow(
      /TELEGRAM_BOT_TOKEN/,
    );
  });
});
