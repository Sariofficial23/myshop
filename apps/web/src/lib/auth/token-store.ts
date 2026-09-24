/**
 * Access token живёт только в памяти (не попадает в localStorage).
 * Refresh token хранится в localStorage, чтобы вход переживал перезагрузку страницы
 * вне Telegram; внутри Telegram вход повторяется по initData при каждом запуске.
 */
const REFRESH_KEY = 'myshop.refreshToken';

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken: () => accessToken,

  getRefreshToken(): string | null {
    try {
      return window.localStorage.getItem(REFRESH_KEY);
    } catch {
      return null;
    }
  },

  set(tokens: { accessToken: string; refreshToken: string }): void {
    accessToken = tokens.accessToken;
    try {
      window.localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
    } catch {
      // localStorage недоступен (приватный режим) — работаем только в памяти
    }
  },

  clear(): void {
    accessToken = null;
    try {
      window.localStorage.removeItem(REFRESH_KEY);
    } catch {
      // ignore
    }
  },
};
