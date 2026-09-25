'use client';

import type { SerialType } from '@myshop/shared';
import { Button } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { ErrorMessage } from '@/components/error-message';

import { serialsApi } from '@/lib/api/sales';

/**
 * Выбор IMEI / серийных номеров, которые есть в наличии в выбранном филиале.
 * Номер можно отметить в списке, найти поиском или отсканировать.
 */
export function SerialSelect({
  variantId,
  branchId,
  serialType,
  selected,
  onChange,
}: {
  variantId: string;
  branchId: string;
  serialType: SerialType;
  selected: string[];
  onChange: (numbers: string[]) => void;
}) {
  const t = useTranslations('serialPicker');
  const [filter, setFilter] = useState('');
  const [scanning, setScanning] = useState(false);
  const [notFound, setNotFound] = useState<string | null>(null);
  const serials = useQuery({
    queryKey: ['serials', 'in-stock', variantId, branchId],
    queryFn: () => serialsApi.inStock(variantId, branchId),
    enabled: branchId !== '',
  });
  const available = useMemo(() => serials.data ?? [], [serials.data]);

  const toggle = useCallback(
    (number: string) =>
      onChange(
        selected.includes(number) ? selected.filter((n) => n !== number) : [...selected, number],
      ),
    [onChange, selected],
  );

  const onScan = useCallback(
    (code: string) => {
      setScanning(false);
      const normalized = code.replace(/\s/g, '').toUpperCase();
      const match = available.find((s) => s.number.toUpperCase() === normalized);
      if (!match) {
        setNotFound(code);
        return;
      }
      setNotFound(null);
      if (!selected.includes(match.number)) onChange([...selected, match.number]);
    },
    [available, onChange, selected],
  );

  const needle = filter.replace(/\s/g, '').toUpperCase();
  const visible = needle
    ? available.filter((s) => s.number.toUpperCase().includes(needle))
    : available;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          {serialType === 'IMEI' ? t('pickImei') : t('pickSerial')}
        </p>
        <p className="text-sm text-slate-500">
          {t('selectedOf', { selected: selected.length, total: available.length })}
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="search"
          inputMode="numeric"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('findNumber')}
          aria-label={t('findNumber')}
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 font-mono text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
        />
        <Button variant="secondary" aria-label="scan" onClick={() => setScanning(true)}>
          <ScanBarcode aria-hidden size={22} />
        </Button>
      </div>
      {notFound ? (
        <p role="alert" className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">
          {t('numberNotInStock', { number: notFound })}
        </p>
      ) : null}
      <ErrorMessage error={serials.error} />
      {serials.isPending && branchId ? (
        <p className="text-sm text-slate-500">{t('loading')}</p>
      ) : null}
      {serials.data && available.length === 0 ? (
        <p className="text-sm text-red-600">{t('noSerialsInStock')}</p>
      ) : null}
      {visible.length ? (
        <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto rounded-2xl ring-1 ring-slate-200">
          {visible.map((serial) => {
            const checked = selected.includes(serial.number);
            return (
              <li key={serial.id}>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 active:bg-slate-50">
                  <input
                    type="checkbox"
                    className="size-5 accent-brand-600"
                    checked={checked}
                    onChange={() => toggle(serial.number)}
                  />
                  <span className="font-mono text-base">{serial.number}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      {scanning ? <ScannerDialog onResult={onScan} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}
