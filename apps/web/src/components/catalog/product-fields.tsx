'use client';

import { PRODUCT_UNITS, type ProductUnit, type SerialType } from '@myshop/shared';
import { SelectField, TextField } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { BrandSelect, CategorySelect } from './catalog-selects';

export interface ProductFormState {
  name: string;
  sku: string;
  categoryId: string;
  brandId: string;
  description: string;
  unit: ProductUnit;
  minimumStock: string;
  serialType: '' | SerialType;
  warrantyMonths: string;
}

export const emptyProductForm: ProductFormState = {
  name: '',
  sku: '',
  categoryId: '',
  brandId: '',
  description: '',
  unit: 'PCS',
  minimumStock: '0',
  serialType: '',
  warrantyMonths: '0',
};

/** Поля товара (без вариантов) — общие для создания и редактирования. */
export function ProductFields({
  form,
  onChange,
  disabled,
}: {
  form: ProductFormState;
  onChange: (form: ProductFormState) => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) =>
    onChange({ ...form, [key]: value });

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('products.name')}
        placeholder={t('products.namePlaceholder')}
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        disabled={disabled}
        required
        maxLength={200}
      />
      <TextField
        label={t('products.sku')}
        hint={t('products.skuHint')}
        value={form.sku}
        onChange={(e) => set('sku', e.target.value.toUpperCase())}
        disabled={disabled}
        pattern="[A-Za-z0-9][A-Za-z0-9\-_./]{0,63}"
        maxLength={64}
      />
      <CategorySelect
        value={form.categoryId}
        onChange={(v) => set('categoryId', v)}
        disabled={disabled}
      />
      <BrandSelect value={form.brandId} onChange={(v) => set('brandId', v)} disabled={disabled} />
      <SelectField
        label={t('products.serialType')}
        value={form.serialType}
        disabled={disabled}
        onChange={(e) => set('serialType', e.target.value as ProductFormState['serialType'])}
        options={[
          { value: '', label: t('products.serialNone') },
          { value: 'IMEI', label: t('products.serialIMEI') },
          { value: 'SERIAL', label: t('products.serialSERIAL') },
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('products.warrantyMonths')}
          type="number"
          min={0}
          max={120}
          value={form.warrantyMonths}
          onChange={(e) => set('warrantyMonths', e.target.value)}
          disabled={disabled}
        />
        <SelectField
          label={t('products.unit')}
          value={form.unit}
          disabled={disabled}
          onChange={(e) => set('unit', e.target.value as ProductUnit)}
          options={PRODUCT_UNITS.map((unit) => ({ value: unit, label: t(`units.${unit}`) }))}
        />
      </div>
      <TextField
        label={t('products.minimumStock')}
        hint={t('products.minimumStockHint')}
        type="number"
        min={0}
        value={form.minimumStock}
        onChange={(e) => set('minimumStock', e.target.value)}
        disabled={disabled}
      />
      <TextField
        label={`${t('products.description')} (${t('common.optional')})`}
        value={form.description}
        onChange={(e) => set('description', e.target.value)}
        disabled={disabled}
        maxLength={5000}
      />
    </div>
  );
}

/** Состояние формы → тело запроса API. */
export function toProductInput(form: ProductFormState) {
  return {
    name: form.name.trim(),
    sku: form.sku.trim() || undefined,
    categoryId: form.categoryId || null,
    brandId: form.brandId || null,
    description: form.description.trim() || null,
    unit: form.unit,
    minimumStock: Number(form.minimumStock) || 0,
    serialType: form.serialType || null,
    warrantyMonths: Number(form.warrantyMonths) || 0,
  };
}
