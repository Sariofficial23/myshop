'use client';

import { PAYMENT_METHODS, Permission, type PaymentMethod } from '@myshop/shared';
import { Button, Card, cn, SelectField, StatusBadge, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { personName } from '@/components/stock/doc-items-card';
import { installmentsApi } from '@/lib/api/finance';
import { useCan, useMe } from '@/lib/auth/auth-provider';
import { parseMoneyInput } from '@/lib/format/money';
import { useMoney } from '@/lib/hooks/use-money';

export default function InstallmentPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const me = useMe();
  const can = useCan();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const installment = useQuery({
    queryKey: ['installments', id],
    queryFn: () => installmentsApi.get(id),
  });
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const pay = useMutation({
    mutationFn: () =>
      installmentsApi.pay(id, { method, branchId, amount: parseMoneyInput(amount) ?? '' }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['installments', id], updated);
      setAmount('');
      await Promise.all(
        ['installments', 'customers', 'cash', 'sales'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
  const d = installment.data;
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: 'medium', timeZone: 'UTC' });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={d ? d.customer.name : t('installments.title')}
        backHref="/installments"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={installment.error} />
      {d ? (
        <>
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-1 text-slate-700">
                <p className="text-sm text-slate-500">{t('installments.remaining')}</p>
                <p className="text-3xl font-bold text-slate-900">{money(d.remaining)}</p>
                {Number(d.overdueAmount) > 0 ? (
                  <p className="font-semibold text-red-600">
                    {t('installments.overdue', { value: money(d.overdueAmount) })}
                  </p>
                ) : null}
                {d.customer.phone ? (
                  <a href={`tel:${d.customer.phone}`} className="font-semibold text-brand-600">
                    {d.customer.phone}
                  </a>
                ) : null}
                <Link href={`/sales/${d.sale.id}`} className="text-sm text-brand-600">
                  {t('installments.forSale', { number: d.sale.displayNumber })}
                </Link>
                <p className="text-sm text-slate-500">
                  {t('installments.terms', {
                    total: money(d.total),
                    months: d.months,
                    monthly: money(d.monthlyAmount),
                  })}
                </p>
                {Number(d.reducedAmount) > 0 ? (
                  <p className="text-sm text-slate-500">
                    {t('installments.reduced', { value: money(d.reducedAmount) })}
                  </p>
                ) : null}
              </div>
              <StatusBadge tone={d.status === 'PAID' ? 'success' : 'neutral'}>
                {t(`installmentStatus.${d.status}`)}
              </StatusBadge>
            </div>
          </Card>

          {d.status === 'ACTIVE' && can(Permission.SALES_CREATE) ? (
            <Card title={t('installments.acceptPayment')}>
              <div className="flex flex-col gap-3">
                <TextField
                  label={t('installments.amount')}
                  inputMode="decimal"
                  placeholder={d.nextDueAmount ? String(Number(d.nextDueAmount)) : undefined}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  {d.nextDueAmount ? (
                    <Button
                      variant="secondary"
                      onClick={() => setAmount(String(Number(d.nextDueAmount)))}
                    >
                      {t('installments.payNext', { value: money(d.nextDueAmount) })}
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    onClick={() => setAmount(String(Number(d.remaining)))}
                  >
                    {t('installments.payAll')}
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => setMethod(m)}
                      className={cn(
                        'min-h-12 rounded-2xl text-sm font-semibold ring-1',
                        method === m
                          ? 'bg-brand-600 text-white ring-brand-600'
                          : 'bg-white text-slate-700 ring-slate-200',
                      )}
                    >
                      {t(`paymentMethod.${m}`)}
                    </button>
                  ))}
                </div>
                {me.branches.length > 1 ? (
                  <SelectField
                    label={t('installments.branch')}
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
                  />
                ) : null}
                <ErrorMessage error={pay.error} />
                <Button
                  block
                  disabled={pay.isPending || !parseMoneyInput(amount) || !branchId}
                  onClick={() => pay.mutate()}
                >
                  {t('installments.accept')}
                </Button>
              </div>
            </Card>
          ) : null}

          <Card title={t('installments.schedule')} className="p-0">
            <ul className="divide-y divide-slate-100">
              {d.schedule.map((row) => {
                const paid = Number(row.covered) >= Number(row.amount);
                const late = !paid && row.dueDate.slice(0, 10) < today;
                return (
                  <li key={row.dueDate} className="flex items-center justify-between px-4 py-3">
                    <span className={cn(late && 'font-semibold text-red-600')}>
                      {date(row.dueDate)}
                    </span>
                    <span className="text-right">
                      <span className="block font-semibold">{money(row.amount)}</span>
                      <span
                        className={cn(
                          'block text-sm',
                          paid ? 'text-emerald-700' : late ? 'text-red-600' : 'text-slate-500',
                        )}
                      >
                        {paid
                          ? t('installments.rowPaid')
                          : Number(row.covered) > 0
                            ? t('installments.rowPartial', { value: money(row.covered) })
                            : late
                              ? t('installments.rowLate')
                              : t('installments.rowUpcoming')}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {d.payments.length ? (
            <Card title={t('installments.payments')} className="p-0">
              <ul className="divide-y divide-slate-100">
                {d.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-4 py-3">
                    <span>
                      <span className="block">
                        {format.dateTime(new Date(p.createdAt), {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                      <span className="block text-sm text-slate-500">
                        {t(`paymentMethod.${p.method}`)} · {personName(p.receivedBy)}
                      </span>
                    </span>
                    <span className="font-semibold">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}
    </>
  );
}
