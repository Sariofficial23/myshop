'use client';

import {
  canTransitionWarranty,
  Permission,
  WARRANTY_CLAIM_STATUSES,
  type WarrantyClaimStatus,
} from '@myshop/shared';
import { Button, Card, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { personName } from '@/components/stock/doc-items-card';
import { WarrantyStatusBadge } from '@/components/warranty/status-badge';
import { warrantyApi } from '@/lib/api/finance';
import { useCan } from '@/lib/auth/auth-provider';

export default function WarrantyClaimPage() {
  const t = useTranslations();
  const format = useFormatter();
  const can = useCan();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const claim = useQuery({
    queryKey: ['warranty-claims', id],
    queryFn: () => warrantyApi.claim(id),
  });
  const [resolution, setResolution] = useState<string | null>(null);
  const update = useMutation({
    mutationFn: (status: WarrantyClaimStatus) =>
      warrantyApi.update(id, {
        status,
        ...(resolution !== null ? { resolution: resolution.trim() || null } : {}),
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['warranty-claims', id], updated);
      await queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
      await queryClient.invalidateQueries({ queryKey: ['warranty'] });
    },
  });
  const c = claim.data;
  const next = c ? WARRANTY_CLAIM_STATUSES.filter((s) => canTransitionWarranty(c.status, s)) : [];

  return (
    <>
      <PageHeader
        title={c ? c.displayNumber : t('warranty.title')}
        backHref="/warranty"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={claim.error} />
      {c ? (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1 text-slate-700">
                <p className="font-semibold text-slate-900">
                  {c.serialNumber.variant.product.name}
                  {c.serialNumber.variant.name ? ` · ${c.serialNumber.variant.name}` : ''}
                </p>
                <p className="font-mono text-sm">{c.serialNumber.number}</p>
                <p className={c.inWarranty ? 'text-emerald-700' : 'text-amber-700'}>
                  {c.inWarranty ? t('warranty.claimInWarranty') : t('warranty.claimPaid')}
                </p>
                {c.customer ? (
                  <p className="text-sm">
                    {t('sale.customerLine', {
                      name: [c.customer.name, c.customer.phone].filter(Boolean).join(' · '),
                    })}
                  </p>
                ) : null}
                {c.sale ? (
                  <Link href={`/sales/${c.sale.id}`} className="text-sm text-brand-600">
                    {t('returns.forSale', { number: c.sale.displayNumber })}
                  </Link>
                ) : null}
                <p className="text-sm text-slate-500">
                  {format.dateTime(new Date(c.createdAt), {
                    dateStyle: 'long',
                    timeStyle: 'short',
                  })}{' '}
                  · {c.branch.name} · {personName(c.createdBy)}
                </p>
              </div>
              <WarrantyStatusBadge status={c.status} />
            </div>
            <p className="mt-3 rounded-2xl bg-slate-50 p-3">{c.problem}</p>
            {c.resolution ? (
              <p className="mt-2 text-sm text-slate-700">
                {t('warranty.resolution')}: {c.resolution}
              </p>
            ) : null}
          </Card>

          {next.length && can(Permission.SALES_CREATE) ? (
            <Card title={t('warranty.changeStatus')}>
              <div className="flex flex-col gap-3">
                <TextField
                  label={`${t('warranty.resolution')} (${t('common.optional')})`}
                  value={resolution ?? c.resolution ?? ''}
                  onChange={(e) => setResolution(e.target.value)}
                  maxLength={2000}
                />
                <ErrorMessage error={update.error} />
                {next.map((status) => (
                  <Button
                    key={status}
                    block
                    variant={status === 'REJECTED' ? 'danger' : 'primary'}
                    disabled={update.isPending}
                    onClick={() => update.mutate(status)}
                  >
                    {t(`warranty.to_${status}`)}
                  </Button>
                ))}
              </div>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
