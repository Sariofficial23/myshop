'use client';

import { SelectField } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { catalogApi } from '@/lib/api/catalog';

export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => catalogApi.categories() });
}

export function useBrands() {
  return useQuery({ queryKey: ['brands'], queryFn: () => catalogApi.brands() });
}

export function CategorySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('products');
  const categories = useCategories();
  return (
    <SelectField
      label={t('category')}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: '', label: t('none') },
        ...(categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
      ]}
    />
  );
}

export function BrandSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('products');
  const brands = useBrands();
  return (
    <SelectField
      label={t('brand')}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      options={[
        { value: '', label: t('none') },
        ...(brands.data ?? []).map((b) => ({ value: b.id, label: b.name })),
      ]}
    />
  );
}
