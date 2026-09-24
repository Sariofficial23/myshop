import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import messages from '../../messages/ru.json';
import { ApiError } from '@/lib/api/api-error';
import { healthApi } from '@/lib/api/health';
import { SystemStatus } from './system-status';

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="ru" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SystemStatus', () => {
  it('shows API and database as working', async () => {
    vi.spyOn(healthApi, 'liveness').mockResolvedValue({
      status: 'ok',
      service: 'myshop-api',
      version: '0.1.0',
      environment: 'test',
      uptimeSeconds: 1,
      timestamp: '',
    });
    vi.spyOn(healthApi, 'readiness').mockResolvedValue({
      status: 'ok',
      checks: { database: { status: 'ok', latencyMs: 4 } },
      timestamp: '',
    });

    renderWithProviders(<SystemStatus />);

    expect(await screen.findByText('Версия 0.1.0')).toBeInTheDocument();
    expect(await screen.findByText('4 мс')).toBeInTheDocument();
    expect(screen.getAllByText('Работает')).toHaveLength(2);
  });

  it('shows a Russian error message when the server is unreachable', async () => {
    vi.spyOn(healthApi, 'liveness').mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'fail'));
    vi.spyOn(healthApi, 'readiness').mockRejectedValue(new ApiError('NETWORK_ERROR', 0, 'fail'));

    renderWithProviders(<SystemStatus />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Нет связи с сервером. Проверьте интернет.',
    );
    expect(screen.getByRole('button', { name: 'Проверить снова' })).toBeInTheDocument();
  });
});
