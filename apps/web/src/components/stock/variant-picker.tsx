'use client';

import { Button, Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { QuickProductForm } from './quick-product-form';
import { ErrorMessage } from '@/components/error-message';
import { ApiError } from '@/lib/api/api-error';
import { catalogApi, type Product, type Variant } from '@/lib/api/catalog';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export interface PickedVariant {
  product: Product;
  variant: Variant;
}

/**
 * Выбор варианта товара для документа: поиск или сканер штрихкода.
 * allowCreate — если товара нет, его можно создать прямо здесь (приход нового товара).
 */
export function VariantPicker({
  onPick,
  allowCreate = false,
}: {
  onPick: (picked: PickedVariant) => void;
  allowCreate?: boolean;
}) {
  const t = useTranslations('purchases');
  const tq = useTranslations('quickProduct');
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(null);
  const [creating, setCreating] = useState<{ name: string; barcode: string } | null>(null);
  const search = useDebouncedValue(q.trim());
  const results = useQuery({
    queryKey: ['products', { search, picker: true }],
    queryFn: () => catalogApi.products({ q: search }),
    enabled: search.length >= 2,
  });

  const pick = useCallback(
    (picked: PickedVariant) => {
      setQ('');
      onPick(picked);
    },
    [onPick],
  );

  const onScan = useCallback(
    async (code: string) => {
      setScanning(false);
      setScanError(null);
      try {
        const found = await catalogApi.byBarcode(code);
        const variant = found.product.variants.find((v) => v.id === found.variantId);
        if (variant) pick({ product: found.product, variant });
      } catch (error) {
        // Незнакомый штрихкод при приходе — сразу предлагаем создать товар с этим штрихкодом
        if (allowCreate && error instanceof ApiError && error.code === 'BARCODE_NOT_FOUND') {
          setCreating({ name: '', barcode: code });
          return;
        }
        setScanError(error);
      }
    },
    [allowCreate, pick],
  );

  const options =
    search.length >= 2
      ? (results.data?.items ?? []).flatMap((product) =>
          product.variants.filter((v) => v.isActive).map((variant) => ({ product, variant })),
        )
      : [];

  if (creating) {
    return (
      <QuickProductForm
        initialName={creating.name}
        initialBarcode={creating.barcode}
        onCancel={() => setCreating(null)}
        onCreated={(product) => {
          setCreating(null);
          const variant = product.variants[0];
          if (variant) pick({ product, variant });
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchProduct')}
          aria-label={t('searchProduct')}
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
        />
        <Button variant="secondary" aria-label="scan" onClick={() => setScanning(true)}>
          <ScanBarcode aria-hidden size={22} />
        </Button>
      </div>
      <ErrorMessage error={scanError} />
      {options.length ? (
        <Card className="p-0">
          <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
            {options.map(({ product, variant }) => (
              <li key={variant.id}>
                <button
                  type="button"
                  className="block w-full text-left active:bg-slate-50"
                  onClick={() => pick({ product, variant })}
                >
                  <ListRow
                    title={product.name}
                    subtitle={[variant.name, variant.sku].filter(Boolean).join(' · ')}
                    trailing="+"
                  />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {allowCreate && search.length >= 2 && results.data ? (
        <button
          type="button"
          onClick={() => setCreating({ name: q.trim(), barcode: '' })}
          className="min-h-12 rounded-2xl bg-white px-4 text-left text-[15px] font-semibold text-brand-600 ring-1 ring-black/5 active:bg-slate-50"
        >
          {tq('createNamed', { name: q.trim() })}
        </button>
      ) : null}
      {allowCreate && search.length < 2 ? (
        <button
          type="button"
          onClick={() => setCreating({ name: '', barcode: '' })}
          className="min-h-11 self-start px-1 text-[15px] font-semibold text-brand-600"
        >
          {tq('create')}
        </button>
      ) : null}
      {scanning ? <ScannerDialog onResult={onScan} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}
