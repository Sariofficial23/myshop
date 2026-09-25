'use client';

import { Button, Card, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { type Customer, customersApi } from '@/lib/api/sales';

/** Создание / изменение клиента. */
export function CustomerForm({
  customer,
  onDone,
}: {
  customer: Customer | null;
  onDone: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [notes, setNotes] = useState(customer?.notes ?? '');
  const save = useMutation({
    mutationFn: (isActive?: boolean) => {
      const body = { name: name.trim(), phone: phone.trim() || null, notes: notes.trim() || null };
      return customer
        ? customersApi.update(customer.id, { ...body, ...(isActive === false ? { isActive } : {}) })
        : customersApi.create(body);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      onDone();
    },
  });

  return (
    <Card title={customer ? customer.name : t('customers.new')}>
      <div className="flex flex-col gap-3">
        <TextField
          label={t('customers.name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
        <TextField
          label={t('customers.phone')}
          type="tel"
          inputMode="tel"
          placeholder="+998"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={32}
        />
        <TextField
          label={`${t('customers.notes')} (${t('common.optional')})`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
        />
        <ErrorMessage error={save.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={name.trim() === '' || save.isPending}
            onClick={() => save.mutate(undefined)}
          >
            {t('common.save')}
          </Button>
        </div>
        {customer ? (
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate(false)}>
            {t('customers.archive')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
