'use client';

import type { SerialType } from '@myshop/shared';
import { Button, Card, cn, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { catalogApi, type Product } from '@/lib/api/catalog';
import { parseMoneyInput } from '@/lib/format/money';

type Kind = 'IMEI' | 'SERIAL' | 'NONE';
const KINDS: readonly Kind[] = ['IMEI', 'SERIAL', 'NONE'];

/**
 * Быстрое создание товара прямо из документа (приход): название, тип учёта, цена, штрихкод.
 * Остальное (категория, бренд, варианты) можно дополнить потом в карточке товара.
 */
export function QuickProductForm({
  initialName = '',
  initialBarcode = '',
  onCreated,
  onCancel,
}: {
  initialName?: string;
  initialBarcode?: string;
  onCreated: (product: Product) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('quickProduct');
  const queryClient = useQueryClient();
  const [name, setName] = useState(initialName);
  const [kind, setKind] = useState<Kind>('IMEI');
  const [price, setPrice] = useState('');
  const [barcode, setBarcode] = useState(initialBarcode);
  const [warranty, setWarranty] = useState('12');
  const priceValid = price.trim() === '' || parseMoneyInput(price) !== null;

  const create = useMutation({
    mutationFn: () =>
      catalogApi.createProduct({
        name: name.trim(),
        serialType: kind === 'NONE' ? null : (kind as SerialType),
        warrantyMonths: Number(warranty) || 0,
        variants: [
          {
            salePrice: parseMoneyInput(price),
            barcodes: barcode.trim() ? [barcode.trim()] : [],
          },
        ],
      }),
    onSuccess: async (product) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] });
      onCreated(product);
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim().length >= 1 && priceValid) create.mutate();
  };

  return (
    <Card title={t('title')}>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <TextField
          label={t('name')}
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">{t('kind')}</span>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-[#e3e3e8] p-0.5">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k);
                  if (k === 'NONE' && warranty === '12') setWarranty('0');
                  if (k !== 'NONE' && warranty === '0') setWarranty('12');
                }}
                className={cn(
                  'min-h-10 rounded-[10px] text-[13px] font-semibold',
                  kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
                )}
              >
                {t(`kind_${k}`)}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-[#8e8e93]">{t(`kindHint_${kind}`)}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label={t('salePrice')}
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            error={priceValid ? undefined : ' '}
          />
          <TextField
            label={t('warranty')}
            type="number"
            min={0}
            max={120}
            inputMode="numeric"
            value={warranty}
            onChange={(e) => setWarranty(e.target.value)}
          />
        </div>
        <TextField
          label={`${t('barcode')} (${t('optional')})`}
          inputMode="numeric"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          maxLength={64}
        />
        <ErrorMessage error={create.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending || !name.trim()}>
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
