'use client';

import { Button, Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { ErrorMessage } from '@/components/error-message';
import { catalogApi, type Product, type Variant } from '@/lib/api/catalog';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

export interface PickedVariant {
  product: Product;
  variant: Variant;
}

/** Выбор варианта товара для документа: поиск или сканер штрихкода. */
export function VariantPicker({ onPick }: { onPick: (picked: PickedVariant) => void }) {
  const t = useTranslations('purchases');
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(null);
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
        setScanError(error);
      }
    },
    [pick],
  );

  const options =
    search.length >= 2
      ? (results.data?.items ?? []).flatMap((product) =>
          product.variants.filter((v) => v.isActive).map((variant) => ({ product, variant })),
        )
      : [];

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
      {scanning ? <ScannerDialog onResult={onScan} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}
