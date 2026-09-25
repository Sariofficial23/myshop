'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow, StatusBadge, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { WarrantyStatusBadge } from '@/components/warranty/status-badge';
import { warrantyApi } from '@/lib/api/finance';
import { useCan, useMe } from '@/lib/auth/auth-provider';

/** Гарантия: проверка по IMEI, приём устройства, открытые обращения. */
export default function WarrantyPage() {
  const t = useTranslations();
  const format = useFormatter();
  const can = useCan();
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [input, setInput] = useState('');
  const [number, setNumber] = useState('');
  const [scanning, setScanning] = useState(false);
  const [problem, setProblem] = useState('');
  const [branchId] = useState(me.branches[0]?.id ?? '');

  const lookup = useQuery({
    queryKey: ['warranty', number],
    queryFn: () => warrantyApi.lookup(number),
    enabled: number !== '',
    retry: false,
  });
  const open = useQuery({
    queryKey: ['warranty-claims', 'open'],
    queryFn: () => warrantyApi.claims(),
  });
  const create = useMutation({
    mutationFn: () => warrantyApi.create({ serialNumber: number, branchId, problem }),
    onSuccess: async (claim) => {
      await queryClient.invalidateQueries({ queryKey: ['warranty-claims'] });
      router.push(`/warranty-claims/${claim.id}`);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    setNumber(input.trim());
  };
  const d = lookup.data;
  const date = (value: string) => format.dateTime(new Date(value), { dateStyle: 'medium' });
  const activeClaims = (open.data?.items ?? []).filter(
    (c) => c.status !== 'RETURNED' && c.status !== 'REJECTED',
  );

  return (
    <>
      <PageHeader title={t('warranty.title')} backHref="/more" backLabel={t('common.back')} />
      <form className="flex gap-2" onSubmit={onSubmit}>
        <input
          type="search"
          inputMode="numeric"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('warranty.search')}
          aria-label={t('warranty.search')}
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 font-mono text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
        />
        <Button variant="secondary" aria-label="scan" onClick={() => setScanning(true)}>
          📷
        </Button>
        <Button type="submit">{t('warranty.check')}</Button>
      </form>
      <ErrorMessage error={lookup.error} />

      {d ? (
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold">
                {d.variant.product.name}
                {d.variant.name ? (
                  <span className="font-normal text-slate-500"> · {d.variant.name}</span>
                ) : null}
              </p>
              <p className="font-mono text-sm text-slate-600">{d.number}</p>
            </div>
            <StatusBadge tone={d.inWarranty ? 'success' : 'danger'}>
              {d.inWarranty
                ? t('warranty.active')
                : d.sold
                  ? t('warranty.expired')
                  : t('warranty.notSold')}
            </StatusBadge>
          </div>
          {d.sale ? (
            <div className="mt-3 flex flex-col gap-1 text-sm text-slate-700">
              <Link href={`/sales/${d.sale.id}`} className="text-brand-600">
                {t('warranty.soldBy', {
                  number: d.sale.displayNumber,
                  date: date(d.sale.date),
                  branch: d.sale.branch.name,
                })}
              </Link>
              {d.sale.customer ? (
                <p>
                  {t('sale.customerLine', {
                    name: [d.sale.customer.name, d.sale.customer.phone].filter(Boolean).join(' · '),
                  })}
                </p>
              ) : null}
              {d.warrantyEnd ? (
                <p>{t('warranty.until', { date: date(d.warrantyEnd) })}</p>
              ) : (
                <p>{t('warranty.noWarranty')}</p>
              )}
            </div>
          ) : null}
          {d.claims.length ? (
            <ul className="mt-3 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-200">
              {d.claims.map((c) => (
                <li key={c.id}>
                  <Link href={`/warranty-claims/${c.id}`} className="block active:bg-slate-50">
                    <ListRow
                      title={`${c.displayNumber} · ${c.problem}`}
                      subtitle={date(c.createdAt)}
                      trailing={<WarrantyStatusBadge status={c.status} />}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
          {d.sold && can(Permission.SALES_CREATE) ? (
            <div className="mt-3 flex flex-col gap-3 border-t border-slate-100 pt-3">
              {!d.inWarranty ? (
                <p className="text-sm text-amber-700">{t('warranty.paidRepairHint')}</p>
              ) : null}
              <TextField
                label={t('warranty.problem')}
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                maxLength={2000}
              />
              <ErrorMessage error={create.error} />
              <Button
                block
                disabled={create.isPending || problem.trim() === '' || !branchId}
                onClick={() => create.mutate()}
              >
                {t('warranty.accept')}
              </Button>
            </div>
          ) : null}
        </Card>
      ) : null}

      <h2 className="text-lg font-semibold">{t('warranty.openClaims')}</h2>
      {open.data && activeClaims.length === 0 ? (
        <p className="text-slate-500">{t('warranty.noOpenClaims')}</p>
      ) : null}
      {activeClaims.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {activeClaims.map((c) => (
              <li key={c.id}>
                <Link href={`/warranty-claims/${c.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={`${c.displayNumber} · ${c.serialNumber.variant.product.name}`}
                    subtitle={[c.customer?.name, c.problem].filter(Boolean).join(' · ')}
                    trailing={<WarrantyStatusBadge status={c.status} />}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {scanning ? (
        <ScannerDialog
          onResult={(code) => {
            setScanning(false);
            setInput(code);
            setNumber(code);
          }}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </>
  );
}
