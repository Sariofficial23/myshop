'use client';

import { Button, Card, StatusBadge } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { errorMessageKey } from '@/lib/api/api-error';
import { healthApi } from '@/lib/api/health';

/** Показывает доступность backend и базы данных (через /api/health и /api/health/ready). */
export function SystemStatus() {
  const t = useTranslations();
  const liveness = useQuery({ queryKey: ['health', 'liveness'], queryFn: healthApi.liveness });
  const readiness = useQuery({
    queryKey: ['health', 'readiness'],
    queryFn: healthApi.readiness,
    retry: false,
  });

  const refetch = () => {
    void liveness.refetch();
    void readiness.refetch();
  };

  return (
    <Card title={t('system.title')}>
      <ul className="flex flex-col gap-3">
        <li className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('system.api')}</p>
            {liveness.data ? (
              <p className="text-sm text-slate-500">
                {t('system.version', { version: liveness.data.version })}
              </p>
            ) : null}
          </div>
          {liveness.isPending ? (
            <StatusBadge tone="neutral">{t('system.checking')}</StatusBadge>
          ) : liveness.isSuccess ? (
            <StatusBadge tone="success">{t('system.ok')}</StatusBadge>
          ) : (
            <StatusBadge tone="danger">{t('system.error')}</StatusBadge>
          )}
        </li>
        <li className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{t('system.database')}</p>
            {readiness.data?.checks.database.latencyMs !== undefined ? (
              <p className="text-sm text-slate-500">
                {t('system.latency', { ms: readiness.data.checks.database.latencyMs })}
              </p>
            ) : null}
          </div>
          {readiness.isPending ? (
            <StatusBadge tone="neutral">{t('system.checking')}</StatusBadge>
          ) : readiness.isSuccess ? (
            <StatusBadge tone="success">{t('system.ok')}</StatusBadge>
          ) : (
            <StatusBadge tone="danger">{t('system.error')}</StatusBadge>
          )}
        </li>
      </ul>

      {liveness.isError ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(errorMessageKey(liveness.error))}
        </p>
      ) : null}

      {liveness.isError || readiness.isError ? (
        <Button variant="secondary" block className="mt-4" onClick={refetch}>
          {t('system.retry')}
        </Button>
      ) : null}
    </Card>
  );
}
