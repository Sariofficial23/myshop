'use client';

import { TextField } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { parseMoneyInput } from '@/lib/format/money';

export interface VariantFormState {
  name: string;
  color: string;
  storage: string;
  memory: string;
  model: string;
  salePrice: string;
}

export const emptyVariantForm: VariantFormState = {
  name: '',
  color: '',
  storage: '',
  memory: '',
  model: '',
  salePrice: '',
};

export function VariantFields({
  form,
  onChange,
  disabled,
}: {
  form: VariantFormState;
  onChange: (form: VariantFormState) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('products');
  const set = (key: keyof VariantFormState, value: string) => onChange({ ...form, [key]: value });
  const priceInvalid = form.salePrice.trim() !== '' && parseMoneyInput(form.salePrice) === null;
  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t('variantName')}
        placeholder={t('variantNamePlaceholder')}
        value={form.name}
        onChange={(e) => set('name', e.target.value)}
        disabled={disabled}
        maxLength={200}
      />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label={t('color')}
          value={form.color}
          onChange={(e) => set('color', e.target.value)}
          disabled={disabled}
          maxLength={60}
        />
        <TextField
          label={t('storage')}
          value={form.storage}
          onChange={(e) => set('storage', e.target.value)}
          disabled={disabled}
          maxLength={30}
        />
        <TextField
          label={t('memory')}
          value={form.memory}
          onChange={(e) => set('memory', e.target.value)}
          disabled={disabled}
          maxLength={30}
        />
        <TextField
          label={t('model')}
          value={form.model}
          onChange={(e) => set('model', e.target.value)}
          disabled={disabled}
          maxLength={100}
        />
      </div>
      <TextField
        label={t('salePrice')}
        inputMode="decimal"
        value={form.salePrice}
        onChange={(e) => set('salePrice', e.target.value)}
        disabled={disabled}
        error={priceInvalid ? t('salePriceInvalid') : undefined}
      />
    </div>
  );
}

export function isVariantFormValid(form: VariantFormState): boolean {
  return form.salePrice.trim() === '' || parseMoneyInput(form.salePrice) !== null;
}

function text(value: string): string | null {
  return value.trim() || null;
}

export function toVariantInput(form: VariantFormState) {
  return {
    name: text(form.name),
    color: text(form.color),
    storage: text(form.storage),
    memory: text(form.memory),
    model: text(form.model),
    salePrice: parseMoneyInput(form.salePrice),
  };
}
