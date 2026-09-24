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
  | { status: 'unauthenticated'; error?: unknown }
  /** Пользователь Telegram ещё не сотрудник ни одной компании. */
  | { status: 'no-membership'; telegramId?: string };

interface AuthContextValue {
  state: AuthState;
  /** Есть ли подписанные данные Telegram (открыто внутри Telegram). */
  inTelegram: boolean;
  loginDev(telegramId: string): Promise<void>;
  register(input: { companyName: string; branchName?: string }): Promise<void>;
  switchCompany(companyId: string): Promise<void>;
  logout(): Promise<void>;
  reloadMe(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function telegramIdFrom(error: unknown): string | undefined {
  if (error instanceof ApiError && typeof error.details === 'object' && error.details !== null) {
    const id = (error.details as { telegramId?: unknown }).telegramId;
    return typeof id === 'string' ? id : undefined;
  }
  return undefined;
}

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
    if (error instanceof ApiError && error.code === 'NO_MEMBERSHIP') {
      setState({ status: 'no-membership', telegramId: telegramIdFrom(error) });
    } else {
      setState({ status: 'unauthenticated', error });
    }
  }, []);

  // Первичный вход: Telegram initData → сохранённая сессия → экран входа
  useEffect(() => {
    let cancelled = false;
    notifyTelegramReady();
    const initData = getTelegramInitData();

    (async () => {
      try {
        if (initData) {
          const response = await authApi.telegram(initData);
          if (!cancelled) apply(response);
          return;
        }
        if (tokenStore.getRefreshToken() && (await refreshSession())) return;
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
        apply(await authApi.register({ initData: getTelegramInitData(), ...input }));
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
