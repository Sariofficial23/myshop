'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { SupplierSelect } from '@/components/stock/supplier-select';
import { type PickedVariant, VariantPicker } from '@/components/stock/variant-picker';
import { purchasesApi } from '@/lib/api/stock';
import { useCan, useMe } from '@/lib/auth/auth-provider';
import { parseMoneyInput } from '@/lib/format/money';
import { findDuplicates, parseSerialList } from '@/lib/format/serials';
import { useMoney } from '@/lib/hooks/use-money';

interface Line extends PickedVariant {
  key: string;
  quantity: string;
  purchasePrice: string;
  salePrice: string;
  serialsText: string;
}

function lineQuantity(line: Line): number {
  return line.product.serialType
    ? parseSerialList(line.serialsText).length
    : Number(line.quantity) || 0;
}

export default function NewPurchasePage() {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const money = useMoney();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const [supplierId, setSupplierId] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [showErrors, setShowErrors] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

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
              purchasePrice: '',
              salePrice: picked.variant.salePrice ? String(Number(picked.variant.salePrice)) : '',
              serialsText: '',
            },
          ],
    );
  }, []);
  const updateLine = (key: string, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  const valid =
    branchId !== '' &&
    lines.length > 0 &&
    lines.every(
      (line) =>
        lineQuantity(line) > 0 &&
        parseMoneyInput(line.purchasePrice) !== null &&
        (line.salePrice.trim() === '' || parseMoneyInput(line.salePrice) !== null) &&
        findDuplicates(parseSerialList(line.serialsText)).length === 0,
    );
  const total = lines.reduce(
    (sum, line) => sum + lineQuantity(line) * Number(parseMoneyInput(line.purchasePrice) ?? 0),
    0,
  );

  const save = useMutation({
    mutationFn: (confirm: boolean) =>
      purchasesApi.create({
        branchId,
        supplierId: supplierId || null,
        documentNumber: documentNumber.trim() || null,
        confirm,
        items: lines.map((line) => ({
          variantId: line.variant.id,
          quantity: lineQuantity(line),
          purchasePrice: parseMoneyInput(line.purchasePrice)!,
          salePrice: parseMoneyInput(line.salePrice),
          serialNumbers: line.product.serialType ? parseSerialList(line.serialsText) : [],
        })),
      }),
    onSuccess: async (purchase) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['purchases'] }),
        queryClient.invalidateQueries({ queryKey: ['stock'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
      router.replace(`/purchases/${purchase.id}`);
    },
  });

  const submit = (confirm: boolean) => {
    setShowErrors(true);
    if (valid) save.mutate(confirm);
  };

  return (
    <>
      <PageHeader title={t('purchases.new')} backHref="/purchases" backLabel={t('common.back')} />

      {me.branches.length > 1 ? (
        <SelectField
          label={t('purchases.branch')}
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
        />
      ) : null}

      <VariantPicker onPick={addLine} allowCreate={can(Permission.PRODUCTS_MANAGE)} />
      {lines.length === 0 ? (
        <p className={showErrors ? 'text-sm text-red-600' : 'text-sm text-[#8e8e93]'}>
          {showErrors ? t('purchases.noItems') : t('purchases.startHint')}
        </p>
      ) : null}
      {lines.map((line) => (
        <LineCard
          key={line.key}
          line={line}
          showErrors={showErrors}
          onChange={(patch) => updateLine(line.key, patch)}
          onRemove={() => setLines((current) => current.filter((l) => l.key !== line.key))}
        />
      ))}

      {lines.length ? (
        <>
          {showDetails ? (
            <Card title={t('purchases.details')}>
              <div className="flex flex-col gap-3">
                <SupplierSelect value={supplierId} onChange={setSupplierId} />
                <TextField
                  label={`${t('purchases.documentNumber')} (${t('common.optional')})`}
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  maxLength={64}
                />
              </div>
            </Card>
          ) : (
            <button
              type="button"
              onClick={() => setShowDetails(true)}
              className="min-h-11 self-start px-1 text-[15px] font-semibold text-brand-600"
            >
              {t('purchases.addDetails')}
            </button>
          )}
          <Card>
            <p className="text-lg font-bold">
              {t('purchases.total', { value: money(total.toFixed(2)) })}
            </p>
            <p className="mt-1 text-sm text-slate-500">{t('purchases.confirmHint')}</p>
            <div className="mt-3 flex flex-col gap-2">
              <ErrorMessage error={save.error} />
              <Button block disabled={save.isPending} onClick={() => submit(true)}>
                {t('purchases.confirm')}
              </Button>
              <Button
                block
                variant="secondary"
                disabled={save.isPending}
                onClick={() => submit(false)}
              >
                {t('purchases.saveDraft')}
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
  showErrors,
  onChange,
  onRemove,
}: {
  line: Line;
  showErrors: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations('purchases');
  const [scanning, setScanning] = useState(false);
  const serials = parseSerialList(line.serialsText);
  const duplicates = findDuplicates(serials);
  const priceInvalid = showErrors && parseMoneyInput(line.purchasePrice) === null;
  const onScan = useCallback(
    (code: string) => {
      setScanning(false);
      onChange({ serialsText: [...parseSerialList(line.serialsText), code].join('\n') });
    },
    [line.serialsText, onChange],
  );

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
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor={`serials-${line.key}`}>
              {line.product.serialType === 'IMEI' ? t('imeiList') : t('serialList')}
            </label>
            <textarea
              id={`serials-${line.key}`}
              rows={4}
              inputMode="numeric"
              value={line.serialsText}
              onChange={(e) => onChange({ serialsText: e.target.value })}
              className="rounded-2xl bg-white p-3 font-mono text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-slate-500">
                {t('serialsCount', { count: serials.length })}
              </p>
              <Button variant="secondary" aria-label="scan" onClick={() => setScanning(true)}>
                <ScanBarcode aria-hidden size={22} />
              </Button>
            </div>
            {duplicates.length ? (
              <p className="text-sm text-red-600">
                {t('serialsDuplicates', { list: duplicates.join(', ') })}
              </p>
            ) : null}
            {showErrors && serials.length === 0 ? (
              <p className="text-sm text-red-600">{t('serialsRequired')}</p>
            ) : null}
          </div>
        ) : (
          <TextField
            label={t('quantity')}
            type="number"
            min={1}
            inputMode="numeric"
            value={line.quantity}
            onChange={(e) => onChange({ quantity: e.target.value })}
          />
        )}
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('purchasePrice')}
            inputMode="decimal"
            value={line.purchasePrice}
            onChange={(e) => onChange({ purchasePrice: e.target.value })}
            error={priceInvalid ? ' ' : undefined}
          />
          <TextField
            label={t('salePrice')}
            inputMode="decimal"
            value={line.salePrice}
            onChange={(e) => onChange({ salePrice: e.target.value })}
          />
        </div>
      </div>
      {scanning ? <ScannerDialog onResult={onScan} onClose={() => setScanning(false)} /> : null}
    </Card>
  );
}
