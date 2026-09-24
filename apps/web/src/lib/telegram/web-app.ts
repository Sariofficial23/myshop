/**
 * Минимальная обёртка над Telegram WebApp (скрипт telegram-web-app.js подключён в layout).
 * Полная интеграция Mini App SDK (тема, кнопки, haptics) — этап 9.
 */
interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; language_code?: string } };
  ready(): void;
  expand(): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | undefined {
  return typeof window === 'undefined' ? undefined : window.Telegram?.WebApp;
}

/** Подписанные данные запуска Mini App. Пустая строка — открыто не из Telegram. */
export function getTelegramInitData(): string {
  return getTelegramWebApp()?.initData ?? '';
}

export function notifyTelegramReady(): void {
  const webApp = getTelegramWebApp();
  if (webApp?.initData) {
    webApp.ready();
    webApp.expand();
  }
}
