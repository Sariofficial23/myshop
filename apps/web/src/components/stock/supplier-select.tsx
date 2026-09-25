'use client';

import { Permission } from '@myshop/shared';
import { Button, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { suppliersApi } from '@/lib/api/stock';
import { useCan } from '@/lib/auth/auth-provider';

/** Выбор поставщика с быстрым добавлением нового прямо из документа. */
export function SupplierSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations('purchases');
  const canCreate = useCan()(Permission.SUPPLIERS_MANAGE);
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () => suppliersApi.create({ name }),
    onSuccess: async (supplier) => {
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      onChange(supplier.id);
      setAdding(false);
      setName('');
    },
  });

  if (adding) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <TextField
            className="flex-1"
            label={t('supplierName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={200}
          />
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            ✓
          </Button>
          <Button variant="secondary" onClick={() => setAdding(false)}>
            ✕
          </Button>
        </div>
        <ErrorMessage error={create.error} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <SelectField
        label={t('supplier')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        options={[
          { value: '', label: t('noSupplier') },
          ...(suppliers.data ?? []).map((s) => ({ value: s.id, label: s.name })),
        ]}
      />
      {canCreate ? (
        <button
          type="button"
          className="self-start py-2 text-sm font-medium text-brand-600"
          onClick={() => setAdding(true)}
        >
          {t('addSupplier')}
        </button>
      ) : null}
    </div>
  );
}
