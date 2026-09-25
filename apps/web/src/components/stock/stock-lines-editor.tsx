'use client';

import { Card, TextField } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import type { StockLineInput } from '@/lib/api/documents';
import { SerialSelect } from './serial-select';
import { type PickedVariant, VariantPicker } from './variant-picker';

export interface StockLine extends PickedVariant {
  key: string;
  quantity: string;
  serials: string[];
}

export function lineQuantity(line: StockLine): number {
  if (line.product.serialType) return line.serials.length;
  if (line.quantity.trim() === '') return -1;
  const qty = Number(line.quantity);
  return Number.isInteger(qty) && qty >= 0 ? qty : -1;
}

/** Все строки заполнены: количество > 0 (или ≥ 0 при инвентаризации), для IMEI — выбраны номера. */
export function linesValid(lines: readonly StockLine[], allowZero = false): boolean {
  return lines.length > 0 && lines.every((line) => lineQuantity(line) >= (allowZero ? 0 : 1));
}

export function toStockLineInputs(lines: readonly StockLine[]): StockLineInput[] {
  return lines.map((line) =>
    line.product.serialType
      ? { variantId: line.variant.id, serialNumbers: line.serials }
      : { variantId: line.variant.id, quantity: lineQuantity(line) },
  );
}

/**
 * Строки складского документа (перемещение, списание, инвентаризация):
 * товар ищется или сканируется, для товаров с IMEI отмечаются номера в наличии филиала.
 */
export function StockLinesEditor({
  branchId,
  lines,
  onChange,
  allowZero = false,
  showErrors = false,
  quantityLabel,
}: {
  branchId: string;
  lines: StockLine[];
  onChange: (lines: StockLine[]) => void;
  allowZero?: boolean;
  showErrors?: boolean;
  quantityLabel?: string;
}) {
  const t = useTranslations('stockDocs');
  const add = useCallback(
    (picked: PickedVariant) => {
      if (lines.some((line) => line.variant.id === picked.variant.id)) return;
      onChange([
        ...lines,
        { ...picked, key: picked.variant.id, quantity: allowZero ? '' : '1', serials: [] },
      ]);
    },
    [allowZero, lines, onChange],
  );
  const update = (key: string, patch: Partial<StockLine>) =>
    onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <>
      {lines.map((line) => {
        const invalid = showErrors && lineQuantity(line) < (allowZero ? 0 : 1);
        return (
          <Card key={line.key}>
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
                onClick={() => onChange(lines.filter((l) => l.key !== line.key))}
              >
                {t('remove')}
              </button>
            </div>
            {line.product.serialType ? (
              <>
                <SerialSelect
                  variantId={line.variant.id}
                  branchId={branchId}
                  serialType={line.product.serialType}
                  selected={line.serials}
                  onChange={(serials) => update(line.key, { serials })}
                />
                {invalid ? <p className="mt-2 text-sm text-red-600">{t('selectSerials')}</p> : null}
              </>
            ) : (
              <TextField
                label={quantityLabel ?? t('quantity')}
                type="number"
                min={allowZero ? 0 : 1}
                inputMode="numeric"
                value={line.quantity}
                onChange={(e) => update(line.key, { quantity: e.target.value })}
                error={invalid ? t('quantityInvalid') : undefined}
              />
            )}
          </Card>
        );
      })}
      <VariantPicker onPick={add} />
      {showErrors && lines.length === 0 ? (
        <p className="text-sm text-red-600">{t('noItems')}</p>
      ) : null}
    </>
  );
}
