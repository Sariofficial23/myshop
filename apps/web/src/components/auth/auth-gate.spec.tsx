import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/ru.json';
import { ApiError } from '@/lib/api/api-error';
import { authApi } from '@/lib/api/auth';
import { healthApi } from '@/lib/api/health';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { AuthGate } from './auth-gate';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn<() => void>(), push: vi.fn<() => void>() }),
}));

function renderGate(children: ReactNode = <p>Приложение</p>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <QueryClientProvider client={client}>
        <AuthProvider>
          <AuthGate>{children}</AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const me = {
  user: {
    id: 'u1',
    telegramId: '42',
    firstName: 'Ali',
    lastName: null,
    username: null,
    languageCode: 'ru',
  },
  company: { id: 'c1', name: 'Techno House', currency: 'UZS', timezone: 'Asia/Tashkent' },
  role: 'OWNER',
  permissions: [],
  branches: [],
  allBranches: true,
  memberships: [],
} as const;

afterEach(() => {
  vi.restoreAllMocks();
  delete window.Telegram;
  window.localStorage.clear();
});

describe('AuthGate', () => {
  it('outside Telegram without a session shows the "open in Telegram" screen', async () => {
    vi.spyOn(healthApi, 'liveness').mockRejectedValue(new ApiError('NETWORK_ERROR', 0, ''));
    vi.spyOn(healthApi, 'readiness').mockRejectedValue(new ApiError('NETWORK_ERROR', 0, ''));
    renderGate();
    expect(await screen.findByText('Откройте MyShop через Telegram')).toBeInTheDocument();
    expect(screen.queryByText('Приложение')).not.toBeInTheDocument();
  });

  it('inside Telegram logs in with initData and renders the app', async () => {
    window.Telegram = {
      WebApp: { initData: 'signed-data', ready: vi.fn<() => void>(), expand: vi.fn<() => void>() },
    };
    const login = vi.spyOn(authApi, 'telegram').mockResolvedValue({
      accessToken: 'A',
      refreshToken: 'R',
      expiresIn: 900,
      me: me as never,
    });
    renderGate();
    expect(await screen.findByText('Приложение')).toBeInTheDocument();
    expect(login).toHaveBeenCalledWith('signed-data');
    expect(window.Telegram.WebApp?.ready).toHaveBeenCalled();
  });

  it('shows the Telegram ID and "create shop" form for users without a company', async () => {
    window.Telegram = {
      WebApp: { initData: 'signed-data', ready: vi.fn<() => void>(), expand: vi.fn<() => void>() },
    };
    vi.spyOn(authApi, 'telegram').mockRejectedValue(
      new ApiError('NO_MEMBERSHIP', 403, 'no', { telegramId: '123456789' }),
    );
    renderGate();
    expect(await screen.findByText('Вас ещё нет в магазине')).toBeInTheDocument();
    expect(screen.getByText('123456789')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать магазин' })).toBeInTheDocument();
  });
});
