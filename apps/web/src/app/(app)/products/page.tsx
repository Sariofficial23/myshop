'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, cn, ListRow, StatusBadge } from '@myshop/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ScanBarcode } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { useCategories } from '@/components/catalog/catalog-selects';
import { ImeiLookup } from '@/components/catalog/imei-lookup';
import { ScannerDialog } from '@/components/catalog/scanner-dialog';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { StockTabs } from '@/components/stock/stock-tabs';
import { catalogApi, type Product } from '@/lib/api/catalog';
import { useCan } from '@/lib/auth/auth-provider';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useMoney } from '@/lib/hooks/use-money';

export default function ProductsPage() {
  const t = useTranslations();
  const router = useRouter();
  const canManage = useCan()(Permission.PRODUCTS_MANAGE);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(null);
  const search = useDebouncedValue(q.trim());
  const categories = useCategories();

  const products = useQuery({
    queryKey: ['products', { search, categoryId }],
    queryFn: () =>
      catalogApi.products({ q: search || undefined, categoryId: categoryId || undefined }),
    placeholderData: keepPreviousData,
  });

  const onScan = useCallback(
    async (code: string) => {
      setScanning(false);
      setScanError(null);
      try {
        const found = await catalogApi.byBarcode(code);
        router.push(`/products/${found.product.id}`);
      } catch (error) {
        setQ(code);
        setScanError(error);
      }
    },
    [router],
  );

  return (
    <>
      <StockTabs />
      <PageHeader
        title={t('products.title')}
        action={
          canManage ? (
            <Link
              href="/products/new"
              className="flex min-h-11 items-center rounded-2xl bg-brand-600 px-4 font-semibold text-white active:bg-brand-800"
            >
              + {t('products.add')}
            </Link>
          ) : null
        }
      />

      <div className="flex gap-2">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('products.searchPlaceholder')}
          aria-label={t('products.searchPlaceholder')}
          className="min-h-12 min-w-0 flex-1 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
        />
        <Button
          variant="secondary"
          aria-label={t('products.scan')}
          onClick={() => setScanning(true)}
        >
          <ScanBarcode aria-hidden size={22} />
        </Button>
      </div>

      {categories.data?.length ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {[{ id: '', name: t('products.allCategories') }, ...categories.data].map((category) => (
            <button
              key={category.id || 'all'}
              type="button"
              onClick={() => setCategoryId(category.id)}
              className={cn(
                'min-h-10 shrink-0 rounded-full px-4 text-sm font-medium ring-1',
                categoryId === category.id
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-700 ring-slate-200',
              )}
            >
              {category.name}
            </button>
          ))}
        </div>
      ) : null}

      <ErrorMessage error={scanError ?? products.error} />
      {search ? <ImeiLookup query={search} /> : null}

      {products.data ? (
        products.data.items.length === 0 ? (
          <p className="py-6 text-center text-slate-500">
            {search || categoryId ? t('products.empty') : t('products.emptyCatalog')}
          </p>
        ) : (
          <>
            {search ? (
              <p className="text-sm text-slate-500">
                {t('products.found', { count: products.data.total })}
              </p>
            ) : null}
            <Card className="p-0">
              <ul className="divide-y divide-slate-100">
                {products.data.items.map((product) => (
                  <li key={product.id}>
                    <Link href={`/products/${product.id}`} className="block active:bg-slate-50">
                      <ProductRow product={product} />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )
      ) : null}

      {scanning ? <ScannerDialog onResult={onScan} onClose={() => setScanning(false)} /> : null}
    </>
  );
}

function ProductRow({ product }: { product: Product }) {
  const t = useTranslations('products');
  const money = useMoney();
  const variant = product.variants[0];
  const subtitle = [
    product.brand?.name,
    product.variants.length > 1
      ? t('variantsCount', { count: product.variants.length })
      : variant?.name,
    product.serialType === 'IMEI' ? 'IMEI' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ListRow
      title={product.name}
      subtitle={subtitle || product.sku}
      trailing={
        product.isActive ? (
          <span className="font-semibold text-slate-900">{money(variant?.salePrice)}</span>
        ) : (
          <StatusBadge tone="neutral">{t('inactive')}</StatusBadge>
        )
      }
    />
  );
}
