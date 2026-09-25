import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../messages/ru.json';
import { ApiError } from '@/lib/api/api-error';
import { authApi } from '@/lib/api/auth';
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
    email: 'ali@example.com',
    firstName: 'Ali',
    lastName: null,
    username: null,
    languageCode: 'ru',
  },
  company: {
    id: 'c1',
    name: 'Techno House',
    currency: 'UZS',
    timezone: 'Asia/Tashkent',
    subscription: { state: 'ACTIVE', paidUntil: null },
  },
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
  it('without a session shows owner / employee sign-in', async () => {
    renderGate();
    expect(await screen.findByRole('button', { name: 'Владелец' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сотрудник' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Нет аккаунта? Зарегистрировать бизнес' }),
    ).toBeInTheDocument();
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

  it('an unlinked Telegram account gets the sign-in screen without an error', async () => {
    window.Telegram = {
      WebApp: { initData: 'signed-data', ready: vi.fn<() => void>(), expand: vi.fn<() => void>() },
    };
    vi.spyOn(authApi, 'telegram').mockRejectedValue(new ApiError('NO_MEMBERSHIP', 403, 'no'));
    renderGate();
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('a company waiting for activation sees the waiting screen instead of the app', async () => {
    window.Telegram = {
      WebApp: { initData: 'signed-data', ready: vi.fn<() => void>(), expand: vi.fn<() => void>() },
    };
    vi.spyOn(authApi, 'telegram').mockResolvedValue({
      accessToken: 'A',
      refreshToken: 'R',
      expiresIn: 900,
      me: {
        ...me,
        company: { ...me.company, subscription: { state: 'PENDING', paidUntil: null } },
      } as never,
    });
    renderGate();
    expect(await screen.findByText('Заявка отправлена')).toBeInTheDocument();
    expect(screen.queryByText('Приложение')).not.toBeInTheDocument();
  });
});
