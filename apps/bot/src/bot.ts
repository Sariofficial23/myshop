import { Bot, InlineKeyboard } from 'grammy';
import type { BotEnv } from './env.js';
import { botMessages } from './messages.js';

/**
 * Бот — только "дверь" в Mini App. Никакой бизнес-логики:
 * вся работа выполняется через backend API и Mini App.
 */
export function createBot(env: Pick<BotEnv, 'TELEGRAM_BOT_TOKEN' | 'MINI_APP_URL'>): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const t = botMessages.ru;

  const openAppKeyboard = () => new InlineKeyboard().webApp(t.openApp, env.MINI_APP_URL);

  bot.command('start', (ctx) =>
    ctx.reply(t.start, { parse_mode: 'HTML', reply_markup: openAppKeyboard() }),
  );

  bot.command('help', (ctx) =>
    ctx.reply(t.help, { parse_mode: 'HTML', reply_markup: openAppKeyboard() }),
  );

  bot.catch((error) => {
    console.error(`[bot] update ${error.ctx.update.update_id} failed:`, error.error);
  });

  return bot;
}
