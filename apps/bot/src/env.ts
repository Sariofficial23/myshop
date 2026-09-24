import { z } from 'zod';

export const botEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  TELEGRAM_BOT_TOKEN: z
    .string({ error: 'TELEGRAM_BOT_TOKEN is required' })
    .regex(/^\d+:[\w-]{30,}$/, 'TELEGRAM_BOT_TOKEN has invalid format (get it from @BotFather)'),
  /** Telegram открывает Mini App только по HTTPS. */
  MINI_APP_URL: z
    .url({ error: 'MINI_APP_URL must be a valid URL' })
    .refine((url) => url.startsWith('https://'), 'MINI_APP_URL must use https://'),
});

export type BotEnv = z.infer<typeof botEnvSchema>;

export function validateBotEnv(raw: Record<string, unknown>): BotEnv {
  const result = botEnvSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid bot configuration:\n${issues}`);
  }
  return result.data;
}
