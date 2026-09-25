'use client';

import type { AuthResponse, MeResponse, Permission } from '@myshop/shared';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { ApiError } from '../api/api-error';
import { authApi } from '../api/auth';
import { onAuthChange, refreshSession } from '../api/client';
import { getTelegramInitData, notifyTelegramReady } from '../telegram/web-app';
import { tokenStore } from './token-store';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; me: MeResponse }
  | { status: 'unauthenticated'; error?: unknown };

interface AuthContextValue {
  state: AuthState;
  /** Есть ли подписанные данные Telegram (открыто внутри Telegram). */
  inTelegram: boolean;
  loginDev(telegramId: string): Promise<void>;
  /** Регистрация владельца бизнеса. */
  register(input: { companyName: string; email: string; password: string }): Promise<void>;
  /** Вход владельца по email и паролю. */
  loginOwner(input: { email: string; password: string }): Promise<void>;
  /** Вход сотрудника по названию компании, логину и паролю. */
  loginStaff(input: { companyName: string; login: string; password: string }): Promise<void>;
  switchCompany(companyId: string): Promise<void>;
  logout(): Promise<void>;
  reloadMe(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  // Скрипт Telegram загружается до гидрации (strategy="beforeInteractive")
  const [inTelegram] = useState(
    () => typeof window !== 'undefined' && getTelegramInitData() !== '',
  );

  const apply = useCallback((response: AuthResponse) => {
    tokenStore.set(response);
    setState({ status: 'authenticated', me: response.me });
  }, []);

  const handleAuthError = useCallback((error: unknown) => {
    // Telegram ещё не привязан к аккаунту — просто показываем экран входа, без ошибки
    const notLinked = error instanceof ApiError && error.code === 'NO_MEMBERSHIP';
    setState({ status: 'unauthenticated', error: notLinked ? undefined : error });
  }, []);

  // Первичный вход: Telegram initData → сохранённая сессия → экран входа
  useEffect(() => {
    let cancelled = false;
    notifyTelegramReady();
    const initData = getTelegramInitData();

    (async () => {
      try {
        // Сначала сохранённая сессия (вход по паролю), затем привязанный Telegram
        if (tokenStore.getRefreshToken() && (await refreshSession())) return;
        if (initData) {
          const response = await authApi.telegram(initData);
          if (!cancelled) apply(response);
          return;
        }
        if (!cancelled) setState({ status: 'unauthenticated' });
      } catch (error) {
        if (!cancelled) handleAuthError(error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply, handleAuthError]);

  // Обновление токенов в фоне (или их потеря) синхронизирует состояние
  useEffect(
    () =>
      onAuthChange((response) => {
        if (response) setState({ status: 'authenticated', me: response.me });
        else setState({ status: 'unauthenticated' });
      }),
    [],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      inTelegram,
      async loginDev(telegramId) {
        apply(await authApi.devLogin(telegramId));
      },
      async register(input) {
        apply(await authApi.register({ ...input, initData: getTelegramInitData() || undefined }));
      },
      async loginOwner(input) {
        apply(await authApi.login({ ...input, initData: getTelegramInitData() || undefined }));
      },
      async loginStaff(input) {
        apply(await authApi.staffLogin({ ...input, initData: getTelegramInitData() || undefined }));
      },
      async switchCompany(companyId) {
        const response = await authApi.switchCompany(companyId);
        queryClient.clear();
        apply(response);
      },
      async logout() {
        try {
          await authApi.logout();
        } catch {
          // Сессия могла уже истечь — всё равно выходим локально
        }
        tokenStore.clear();
        queryClient.clear();
        setState({ status: 'unauthenticated' });
      },
      async reloadMe() {
        const me = await authApi.me();
        setState({ status: 'authenticated', me });
      },
    }),
    [state, inTelegram, apply, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Данные текущего сотрудника. Использовать только внутри AuthGate. */
export function useMe(): MeResponse {
  const { state } = useAuth();
  if (state.status !== 'authenticated') {
    throw new Error('useMe must be used for authenticated users only');
  }
  return state.me;
}

/** Проверка права для скрытия кнопок. Настоящая проверка — на backend. */
export function useCan(): (permission: Permission) => boolean {
  const { state } = useAuth();
  return useCallback(
    (permission: Permission) =>
      state.status === 'authenticated' && state.me.permissions.includes(permission),
    [state],
  );
}
