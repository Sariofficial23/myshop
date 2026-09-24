/**
 * Тексты бота. Вынесены отдельно, чтобы на этапе 9 подключить RU/UZ
 * по language_code пользователя Telegram.
 */
export const botMessages = {
  ru: {
    start:
      '🛒 <b>MyShop</b>\n\nПродажи, склад, IMEI, касса и отчёты вашего магазина — прямо в Telegram.',
    openApp: 'Открыть MyShop',
    help:
      'ℹ️ <b>Помощь</b>\n\n' +
      'Нажмите кнопку «Открыть MyShop», чтобы работать с магазином.\n\n' +
      '/start — главное меню\n/help — эта справка',
  },
} as const;
