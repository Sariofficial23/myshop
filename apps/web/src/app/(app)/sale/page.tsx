'use client';

import { PAYMENT_METHODS, Permission, type PaymentMethod } from '@myshop/shared';
import { Button, Card, cn, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { CustomerSelect } from '@/components/sales/customer-select';
import { SerialSelect } from '@/components/stock/serial-select';
import { type PickedVariant, VariantPicker } from '@/components/stock/variant-picker';
import { type Customer, salesApi } from '@/lib/api/sales';
import { useCan, useMe } from '@/lib/auth/auth-provider';
import { parseMoneyInput } from '@/lib/format/money';
import { useMoney } from '@/lib/hooks/use-money';
import {
  buildInstallment,
  buildPayments,
  cartTotals,
  fromCents,
  lineTotalCents,
  mixedRemainder,
  type PaymentMode,
  toCents,
} from '@/lib/sales/cart';

interface Line extends PickedVariant {
  key: string;
  quantity: string;
  price: string;
  discount: string;
  serials: string[];
}

type SaleMode = PaymentMode | 'INSTALLMENT';
const PAYMENT_MODES: readonly SaleMode[] = [...PAYMENT_METHODS, 'MIXED', 'INSTALLMENT'];

function lineQuantity(line: Line): number {
  return line.product.serialType ? line.serials.length : Math.max(0, Number(line.quantity) || 0);
}

function lineAmounts(line: Line) {
  return {
    quantity: lineQuantity(line),
    priceCents: toCents(parseMoneyInput(line.price)) ?? 0,
    discountCents: toCents(parseMoneyInput(line.discount)) ?? 0,
  };
}

function lineProblem(line: Line): 'price' | 'discount' | 'quantity' | null {
  if (lineQuantity(line) <= 0 || !Number.isInteger(Number(line.quantity) || 0)) return 'quantity';
  if (toCents(parseMoneyInput(line.price)) === null) return 'price';
  if (line.discount.trim() !== '') {
    const discount = toCents(parseMoneyInput(line.discount));
    if (discount === null || lineTotalCents(lineAmounts(line)) < 0) return 'discount';
  }
  return null;
}

export default function SalePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const money = useMoney();
  const queryClient = useQueryClient();
  const canChangePrice = can(Permission.PRODUCTS_MANAGE);
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [mode, setMode] = useState<SaleMode>('CASH');
  const [months, setMonths] = useState('6');
  const [downPayment, setDownPayment] = useState('');
  const [downMethod, setDownMethod] = useState<PaymentMethod>('CASH');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [mixed, setMixed] = useState<Partial<Record<PaymentMethod, string>>>({});
  const [showErrors, setShowErrors] = useState(false);

  const addLine = useCallback((picked: PickedVariant) => {
    setLines((current) =>
      current.some((line) => line.variant.id === picked.variant.id)
        ? current
        : [
            ...current,
            {
              ...picked,
              key: picked.variant.id,
              quantity: '1',
              price: picked.variant.salePrice ? String(Number(picked.variant.salePrice)) : '',
              discount: '',
              serials: [],
            },
          ],
    );
  }, []);
  const updateLine = useCallback(
    (key: string, patch: Partial<Line>) =>
      setLines((current) =>
        current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
      ),
    [],
  );

  const totals = cartTotals(lines.map(lineAmounts));
  const installment =
    mode === 'INSTALLMENT' ? buildInstallment(totals.total, downPayment, downMethod, months) : null;
  const payments =
    mode === 'INSTALLMENT'
      ? (installment?.payments ?? null)
      : buildPayments(mode, totals.total, mixed);
  const remainder = mixedRemainder(totals.total, mixed);
  const installmentOk = mode !== 'INSTALLMENT' || (!!installment && !!customer);
  const valid =
    branchId !== '' &&
    lines.length > 0 &&
    lines.every((l) => !lineProblem(l)) &&
    !!payments &&
    installmentOk;

  const sell = useMutation({
    mutationFn: () =>
      salesApi.create({
        branchId,
        customerId: customer?.id ?? null,
        items: lines.map((line) => {
          const listPrice = line.variant.salePrice;
          const price = parseMoneyInput(line.price)!;
          const priceChanged = !listPrice || toCents(price) !== toCents(String(Number(listPrice)));
          return {
            variantId: line.variant.id,
            ...(line.product.serialType
              ? { serialNumbers: line.serials }
              : { quantity: lineQuantity(line) }),
            ...(priceChanged ? { price } : {}),
            discount: parseMoneyInput(line.discount),
          };
        }),
        payments: payments ?? [],
        ...(installment
          ? {
              installment: {
                months: installment.months,
                ...(firstDueDate ? { firstDueDate } : {}),
              },
            }
          : {}),
      }),
    onSuccess: async (sale) => {
      await Promise.all(
        ['sales', 'stock', 'products', 'serials'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.replace(`/sales/${sale.id}`);
    },
  });

  const submit = () => {
    setShowErrors(true);
    if (valid) sell.mutate();
  };

  const changeBranch = (id: string) => {
    setBranchId(id);
    // IMEI привязаны к филиалу — при смене филиала выбор номеров сбрасывается.
    setLines((current) => current.map((line) => ({ ...line, serials: [] })));
  };

  return (
    <>
      <PageHeader
        title={t('sale.title')}
        action={
          can(Permission.SALES_VIEW) ? (
            <Link
              href="/sales"
              className="flex min-h-11 items-center rounded-2xl bg-white px-4 font-semibold ring-1 ring-slate-200 active:bg-slate-50"
            >
              {t('sale.history')}
            </Link>
          ) : null
        }
      />

      {me.branches.length > 1 ? (
        <Card>
          <SelectField
            label={t('sale.branch')}
            value={branchId}
            onChange={(e) => changeBranch(e.target.value)}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
        </Card>
      ) : null}

      <VariantPicker onPick={addLine} />

      {lines.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('sale.emptyCart')}</p>
      ) : null}
      {lines.map((line) => (
        <LineCard
          key={line.key}
          line={line}
          branchId={branchId}
          canChangePrice={canChangePrice}
          showErrors={showErrors}
          onChange={updateLine}
          onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
        />
      ))}

      {lines.length ? (
        <>
          <Card title={t('sale.customer')}>
            <CustomerSelect value={customer} onChange={setCustomer} />
          </Card>

          <Card title={t('sale.payment')}>
            <div className="grid grid-cols-2 gap-2">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={cn(
                    'min-h-12 rounded-2xl font-semibold ring-1',
                    mode === m
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-200 active:bg-slate-50',
                  )}
                >
                  {t(`paymentMethod.${m}`)}
                </button>
              ))}
            </div>
            {mode === 'MIXED' ? (
              <div className="mt-3 flex flex-col gap-3">
                {PAYMENT_METHODS.map((method) => (
                  <TextField
                    key={method}
                    label={t(`paymentMethod.${method}`)}
                    inputMode="decimal"
                    value={mixed[method] ?? ''}
                    onChange={(e) => setMixed((cur) => ({ ...cur, [method]: e.target.value }))}
                  />
                ))}
                <p
                  className={cn(
                    'text-sm font-medium',
                    remainder === 0 ? 'text-emerald-700' : 'text-red-600',
                  )}
                >
                  {remainder === 0
                    ? t('sale.mixedOk')
                    : remainder > 0
                      ? t('sale.mixedLeft', { value: money(fromCents(remainder)) })
                      : t('sale.mixedOver', { value: money(fromCents(-remainder)) })}
                </p>
              </div>
            ) : null}
            {mode === 'INSTALLMENT' ? (
              <div className="mt-3 flex flex-col gap-3">
                {!customer ? (
                  <p className="text-sm font-medium text-red-600">
                    {t('sale.installmentCustomer')}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  <TextField
                    label={t('sale.months')}
                    type="number"
                    min={1}
                    max={60}
                    inputMode="numeric"
                    value={months}
                    onChange={(e) => setMonths(e.target.value)}
                  />
                  <TextField
                    label={t('sale.firstDueDate')}
                    type="date"
                    value={firstDueDate}
                    onChange={(e) => setFirstDueDate(e.target.value)}
                  />
                </div>
                <TextField
                  label={t('sale.downPayment')}
                  inputMode="decimal"
                  placeholder="0"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                />
                <SelectField
                  label={t('sale.downPaymentMethod')}
                  value={downMethod}
                  onChange={(e) => setDownMethod(e.target.value as PaymentMethod)}
                  options={PAYMENT_METHODS.map((m) => ({
                    value: m,
                    label: t(`paymentMethod.${m}`),
                  }))}
                />
                {installment ? (
                  <p className="rounded-2xl bg-brand-50 p-3 text-sm text-brand-800">
                    {t('sale.installmentPlan', {
                      debt: money(fromCents(installment.debtCents)),
                      months: installment.months,
                      monthly: money(fromCents(installment.monthlyCents)),
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-red-600">{t('sale.installmentInvalid')}</p>
                )}
              </div>
            ) : null}
          </Card>

          <Card>
            <dl className="flex flex-col gap-1 text-slate-600">
              <div className="flex justify-between">
                <dt>{t('sale.subtotal')}</dt>
                <dd>{money(fromCents(totals.subtotal))}</dd>
              </div>
              {totals.discount ? (
                <div className="flex justify-between">
                  <dt>{t('sale.discount')}</dt>
                  <dd>−{money(fromCents(totals.discount))}</dd>
                </div>
              ) : null}
              <div className="flex justify-between text-xl font-bold text-slate-900">
                <dt>{t('sale.toPay')}</dt>
                <dd>{money(fromCents(totals.total))}</dd>
              </div>
            </dl>
            <div className="mt-3 flex flex-col gap-2">
              <ErrorMessage error={sell.error} />
              {showErrors && !valid ? (
                <p className="text-sm text-red-600">{t('sale.fixErrors')}</p>
              ) : null}
              <Button block disabled={sell.isPending} onClick={submit}>
                {sell.isPending ? t('sale.selling') : t('sale.sell')}
              </Button>
            </div>
          </Card>
        </>
      ) : null}
    </>
  );
}

function LineCard({
  line,
  branchId,
  canChangePrice,
  showErrors,
  onChange,
  onRemove,
}: {
  line: Line;
  branchId: string;
  canChangePrice: boolean;
  showErrors: boolean;
  onChange: (key: string, patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('sale');
  const money = useMoney();
  const problem = showErrors ? lineProblem(line) : null;
  const priceEditable = canChangePrice || !line.variant.salePrice;
  const setSerials = useCallback(
    (serials: string[]) => onChange(line.key, { serials }),
    [line.key, onChange],
  );
  const total = lineTotalCents(lineAmounts(line));

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold">{line.product.name}</p>
          <p className="truncate text-sm text-slate-500">
            {[line.variant.name, line.variant.sku].filter(Boolean).join(' · ')}
          </p>
        </div>
        <button
          type="button"
          className="min-h-10 rounded-xl px-3 text-sm text-red-600 active:bg-red-50"
          onClick={onRemove}
        >
          {t('remove')}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        {line.product.serialType ? (
          <SerialSelect
            variantId={line.variant.id}
            branchId={branchId}
            serialType={line.product.serialType}
            selected={line.serials}
            onChange={setSerials}
          />
        ) : (
          <TextField
            label={t('quantity')}
            type="number"
            min={1}
            inputMode="numeric"
            value={line.quantity}
            onChange={(e) => onChange(line.key, { quantity: e.target.value })}
            error={problem === 'quantity' ? ' ' : undefined}
          />
        )}
        {line.product.serialType && problem === 'quantity' ? (
          <p className="text-sm text-red-600">{t('selectSerials')}</p>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('price')}
            inputMode="decimal"
            value={line.price}
            readOnly={!priceEditable}
            onChange={(e) => onChange(line.key, { price: e.target.value })}
            error={problem === 'price' ? t('priceRequired') : undefined}
          />
          <TextField
            label={t('discountAmount')}
            inputMode="decimal"
            value={line.discount}
            onChange={(e) => onChange(line.key, { discount: e.target.value })}
            error={problem === 'discount' ? t('discountInvalid') : undefined}
          />
        </div>
        <p className="text-right font-semibold">{money(fromCents(Math.max(total, 0)))}</p>
      </div>
    </Card>
  );
}
