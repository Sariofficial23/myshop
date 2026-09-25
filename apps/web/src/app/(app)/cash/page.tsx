'use client';

import { CASH_OPERATION_TYPES, type CashOperationType } from '@myshop/shared';
import { Button, Card, cn, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { personName } from '@/components/stock/doc-items-card';
import { cashApi } from '@/lib/api/finance';
import { useMe } from '@/lib/auth/auth-provider';
import { parseMoneyInput } from '@/lib/format/money';
import { useMoney } from '@/lib/hooks/use-money';

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between', strong && 'font-bold text-slate-900')}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Касса филиала: остаток наличных, итоги дня, внесения / изъятия / расходы. */
export default function CashPage() {
  const t = useTranslations();
  const format = useFormatter();
  const money = useMoney();
  const me = useMe();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [type, setType] = useState<CashOperationType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const summary = useQuery({
    queryKey: ['cash', 'summary', branchId, date],
    queryFn: () => cashApi.summary(branchId, date || undefined),
    enabled: branchId !== '',
  });
  const operations = useQuery({
    queryKey: ['cash', 'operations', branchId, date],
    queryFn: () => cashApi.operations(branchId, date || undefined),
    enabled: branchId !== '',
  });
  const create = useMutation({
    mutationFn: () =>
      cashApi.create({ branchId, type, amount: parseMoneyInput(amount) ?? '', reason }),
    onSuccess: async () => {
      setAmount('');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['cash'] });
    },
  });
  const s = summary.data;

  return (
    <>
      <PageHeader title={t('cash.title')} backHref="/more" backLabel={t('common.back')} />
      <Card>
        <div className="grid grid-cols-2 gap-3">
          {me.branches.length > 1 ? (
            <SelectField
              label={t('stockDocs.branch')}
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : null}
          <TextField
            label={t('cash.date')}
            type="date"
            value={date || s?.date || ''}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </Card>
      <ErrorMessage error={summary.error} />
      {s ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">{t('cash.balance')}</p>
            <p className="text-3xl font-bold">{money(s.balance)}</p>
            <p className="mt-1 text-sm text-slate-500">{t('cash.balanceHint')}</p>
          </Card>
          <Card title={t('cash.day')}>
            <dl className="flex flex-col gap-1 text-slate-700">
              <Row label={t('cash.salesCash')} value={money(s.sales.CASH)} />
              <Row label={t('cash.salesCard')} value={money(s.sales.CARD)} />
              <Row label={t('cash.salesTransfer')} value={money(s.sales.TRANSFER)} />
              <Row
                label={t('cash.installments')}
                value={money(
                  String(
                    Number(s.installmentPayments.CASH) +
                      Number(s.installmentPayments.CARD) +
                      Number(s.installmentPayments.TRANSFER),
                  ),
                )}
              />
              <Row
                label={t('cash.refunds')}
                value={`−${money(
                  String(
                    Number(s.refunds.CASH) + Number(s.refunds.CARD) + Number(s.refunds.TRANSFER),
                  ),
                )}`}
              />
              <Row label={t('cash.revenue')} value={money(s.revenue)} strong />
            </dl>
          </Card>
          <Card title={t('cash.cashFlow')}>
            <dl className="flex flex-col gap-1 text-slate-700">
              <Row label={t('cashOperationType.DEPOSIT')} value={money(s.deposits)} />
              <Row label={t('cashOperationType.WITHDRAWAL')} value={`−${money(s.withdrawals)}`} />
              <Row label={t('cashOperationType.EXPENSE')} value={`−${money(s.expenses)}`} />
              <Row label={t('cash.cashIn')} value={money(s.cashIn)} strong />
              <Row label={t('cash.cashOut')} value={`−${money(s.cashOut)}`} strong />
            </dl>
          </Card>
        </>
      ) : null}

      <Card title={t('cash.newOperation')}>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {CASH_OPERATION_TYPES.map((op) => (
              <button
                key={op}
                type="button"
                aria-pressed={type === op}
                onClick={() => setType(op)}
                className={cn(
                  'min-h-12 rounded-2xl text-sm font-semibold ring-1',
                  type === op
                    ? 'bg-brand-600 text-white ring-brand-600'
                    : 'bg-white text-slate-700 ring-slate-200',
                )}
              >
                {t(`cashOperationType.${op}`)}
              </button>
            ))}
          </div>
          <TextField
            label={t('cash.amount')}
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <TextField
            label={t('cash.reason')}
            placeholder={t(`cash.reasonHint_${type}`)}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
          <ErrorMessage error={create.error} />
          <Button
            block
            disabled={create.isPending || !parseMoneyInput(amount) || reason.trim() === ''}
            onClick={() => create.mutate()}
          >
            {t('cash.save')}
          </Button>
        </div>
      </Card>

      {operations.data?.length ? (
        <Card title={t('cash.operations')} className="p-0">
          <ul className="divide-y divide-slate-100">
            {operations.data.map((op) => (
              <li key={op.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium">{t(`cashOperationType.${op.type}`)}</span>
                  <span className="block truncate text-sm text-slate-500">
                    {format.dateTime(new Date(op.createdAt), { timeStyle: 'short' })} · {op.reason}{' '}
                    · {personName(op.createdBy)}
                  </span>
                </span>
                <span
                  className={cn(
                    'shrink-0 font-semibold',
                    op.type === 'DEPOSIT' ? 'text-emerald-700' : 'text-slate-900',
                  )}
                >
                  {op.type === 'DEPOSIT' ? '+' : '−'}
                  {money(op.amount)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
