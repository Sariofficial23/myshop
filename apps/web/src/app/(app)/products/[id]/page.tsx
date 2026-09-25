'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, CheckboxField, StatusBadge, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  type ProductFormState,
  ProductFields,
  toProductInput,
} from '@/components/catalog/product-fields';
import {
  emptyVariantForm,
  isVariantFormValid,
  toVariantInput,
  type VariantFormState,
  VariantFields,
} from '@/components/catalog/variant-fields';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { catalogApi, type Product, type Variant } from '@/lib/api/catalog';
import { useCan } from '@/lib/auth/auth-provider';
import { useMoney } from '@/lib/hooks/use-money';

export default function ProductPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const product = useQuery({ queryKey: ['products', id], queryFn: () => catalogApi.product(id) });
  return (
    <>
      <PageHeader
        title={product.data?.name ?? t('products.title')}
        backHref="/products"
        backLabel={t('common.back')}
      />
      <ErrorMessage error={product.error} />
      {product.data ? <ProductDetails product={product.data} /> : null}
    </>
  );
}

function useProductCache() {
  const queryClient = useQueryClient();
  return async (updated: Product) => {
    queryClient.setQueryData(['products', updated.id], updated);
    await queryClient.invalidateQueries({ queryKey: ['products'], exact: false });
  };
}

function ProductDetails({ product }: { product: Product }) {
  const t = useTranslations();
  const canManage = useCan()(Permission.PRODUCTS_MANAGE);
  const [addingVariant, setAddingVariant] = useState(false);
  return (
    <>
      <ProductInfo product={product} canManage={canManage} />
      <h2 className="mt-2 text-lg font-semibold">{t('products.variants')}</h2>
      {product.variants.map((variant) => (
        <VariantCard key={variant.id} variant={variant} canManage={canManage} />
      ))}
      {canManage ? (
        addingVariant ? (
          <NewVariantCard productId={product.id} onDone={() => setAddingVariant(false)} />
        ) : (
          <Button variant="secondary" block onClick={() => setAddingVariant(true)}>
            + {t('products.addVariant')}
          </Button>
        )
      ) : null}
    </>
  );
}

function ProductInfo({ product, canManage }: { product: Product; canManage: boolean }) {
  const t = useTranslations();
  const onSaved = useProductCache();
  const [form, setForm] = useState<ProductFormState>({
    name: product.name,
    sku: product.sku,
    categoryId: product.category?.id ?? '',
    brandId: product.brand?.id ?? '',
    description: product.description ?? '',
    unit: product.unit,
    minimumStock: String(product.minimumStock),
    serialType: product.serialType ?? '',
    warrantyMonths: String(product.warrantyMonths),
  });
  const [isActive, setIsActive] = useState(product.isActive);
  const save = useMutation({
    mutationFn: () => catalogApi.updateProduct(product.id, { ...toProductInput(form), isActive }),
    onSuccess: onSaved,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        {!product.isActive ? (
          <StatusBadge tone="neutral">{t('products.inactive')}</StatusBadge>
        ) : null}
        <ProductFields form={form} onChange={setForm} disabled={!canManage} />
        {canManage ? (
          <>
            <CheckboxField
              label={t('products.isActive')}
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <ErrorMessage error={save.error} />
            <Button type="submit" block disabled={save.isPending}>
              {save.isSuccess && !save.isPending ? `✓ ${t('common.saved')}` : t('common.save')}
            </Button>
          </>
        ) : null}
      </form>
    </Card>
  );
}

function variantForm(variant: Variant): VariantFormState {
  return {
    name: variant.name ?? '',
    color: variant.color ?? '',
    storage: variant.storage ?? '',
    memory: variant.memory ?? '',
    model: variant.model ?? '',
    salePrice: variant.salePrice ? String(Number(variant.salePrice)) : '',
  };
}

function VariantCard({ variant, canManage }: { variant: Variant; canManage: boolean }) {
  const t = useTranslations();
  const money = useMoney();
  const onSaved = useProductCache();
  const [form, setForm] = useState(() => variantForm(variant));
  const [barcode, setBarcode] = useState('');

  const save = useMutation({
    mutationFn: () => catalogApi.updateVariant(variant.id, toVariantInput(form)),
    onSuccess: onSaved,
  });
  const addBarcode = useMutation({
    mutationFn: () => catalogApi.addBarcode(variant.id, barcode.trim()),
    onSuccess: async (product) => {
      setBarcode('');
      await onSaved(product);
    },
  });
  const removeBarcode = useMutation({ mutationFn: catalogApi.removeBarcode, onSuccess: onSaved });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isVariantFormValid(form)) save.mutate();
  };

  return (
    <Card>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{variant.name ?? variant.sku}</p>
          <p className="text-sm text-slate-500">SKU: {variant.sku}</p>
        </div>
        <p className="shrink-0 text-lg font-bold">
          {variant.salePrice ? money(variant.salePrice) : t('products.noPrice')}
        </p>
      </div>

      {canManage ? (
        <form className="flex flex-col gap-3" onSubmit={onSubmit}>
          <VariantFields form={form} onChange={setForm} />
          <ErrorMessage error={save.error} />
          <Button type="submit" variant="secondary" block disabled={save.isPending}>
            {save.isSuccess && !save.isPending ? `✓ ${t('common.saved')}` : t('common.save')}
          </Button>
        </form>
      ) : null}

      <p className="mt-4 mb-2 text-sm font-medium text-slate-700">{t('products.barcodes')}</p>
      <ul className="flex flex-wrap gap-2">
        {variant.barcodes.map((code) => (
          <li
            key={code.id}
            className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pr-1 pl-3 font-mono text-sm"
          >
            {code.code}
            {canManage ? (
              <button
                type="button"
                aria-label={t('products.removeBarcode', { code: code.code })}
                className="grid size-8 place-items-center rounded-full text-slate-500 active:bg-slate-200"
                onClick={() => removeBarcode.mutate(code.id)}
              >
                ✕
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canManage ? (
        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (barcode.trim()) addBarcode.mutate();
          }}
        >
          <TextField
            className="flex-1"
            label={t('products.addBarcode')}
            inputMode="numeric"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            maxLength={64}
          />
          <Button type="submit" disabled={addBarcode.isPending}>
            +
          </Button>
        </form>
      ) : null}
      <ErrorMessage error={addBarcode.error ?? removeBarcode.error} />
    </Card>
  );
}

function NewVariantCard({ productId, onDone }: { productId: string; onDone: () => void }) {
  const t = useTranslations();
  const onSaved = useProductCache();
  const [form, setForm] = useState(emptyVariantForm);
  const create = useMutation({
    mutationFn: () => catalogApi.addVariant(productId, toVariantInput(form)),
    onSuccess: async (product) => {
      await onSaved(product);
      onDone();
    },
  });
  return (
    <Card title={t('products.addVariant')}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (isVariantFormValid(form)) create.mutate();
        }}
      >
        <VariantFields form={form} onChange={setForm} />
        <ErrorMessage error={create.error} />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={create.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
