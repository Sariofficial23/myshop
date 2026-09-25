'use client';

import { Button, Card, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import {
  emptyProductForm,
  ProductFields,
  toProductInput,
} from '@/components/catalog/product-fields';
import {
  emptyVariantForm,
  isVariantFormValid,
  toVariantInput,
  VariantFields,
} from '@/components/catalog/variant-fields';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { catalogApi } from '@/lib/api/catalog';

export default function NewProductPage() {
  const t = useTranslations();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [product, setProduct] = useState(emptyProductForm);
  const [variant, setVariant] = useState(emptyVariantForm);
  const [barcode, setBarcode] = useState('');

  const create = useMutation({
    mutationFn: () =>
      catalogApi.createProduct({
        ...toProductInput(product),
        variants: [
          { ...toVariantInput(variant), barcodes: barcode.trim() ? [barcode.trim()] : [] },
        ],
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      router.replace(`/products/${created.id}`);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (isVariantFormValid(variant)) create.mutate();
  };

  return (
    <>
      <PageHeader title={t('products.new')} backHref="/products" backLabel={t('common.back')} />
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Card>
          <ProductFields form={product} onChange={setProduct} />
        </Card>
        <Card title={t('products.firstVariant')}>
          <div className="flex flex-col gap-3">
            <VariantFields form={variant} onChange={setVariant} />
            <TextField
              label={`${t('products.barcode')} (${t('common.optional')})`}
              inputMode="numeric"
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              maxLength={64}
            />
          </div>
        </Card>
        <ErrorMessage error={create.error} />
        <Button type="submit" block disabled={create.isPending}>
          {t('common.save')}
        </Button>
      </form>
    </>
  );
}
