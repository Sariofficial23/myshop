import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { createBot } from './bot.js';
import { validateBotEnv } from './env.js';

for (const path of [resolve('.env'), resolve('../../.env')]) {
  if (existsSync(path)) config({ path, quiet: true });
}

const env = validateBotEnv(process.env);
const bot = createBot(env);

await bot.api.setMyCommands([
  { command: 'start', description: 'Открыть MyShop' },
  { command: 'help', description: 'Помощь' },
]);

const stop = () => void bot.stop();
process.once('SIGINT', stop);
process.once('SIGTERM', stop);

// Этап 1: long polling. На этапе 9 добавим webhook-режим для Render.
await bot.start({
  onStart: (info) => console.log(`[bot] @${info.username} started (long polling)`),
});
