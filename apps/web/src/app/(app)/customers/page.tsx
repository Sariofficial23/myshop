'use client';

import { Button, Card, ListRow, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { type Customer, customersApi } from '@/lib/api/sales';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

/** Клиенты: поиск, добавление, изменение. История покупок и долги — этап 7. */
export default function CustomersPage() {
  const t = useTranslations();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const search = useDebouncedValue(q.trim());
  const customers = useQuery({
    queryKey: ['customers', { search }],
    queryFn: () => customersApi.list(search || undefined),
  });

  return (
    <>
      <PageHeader
        title={t('customers.title')}
        backHref="/more"
        backLabel={t('common.back')}
        action={
          editing ? null : <Button onClick={() => setEditing('new')}>+ {t('common.add')}</Button>
        }
      />
      {editing ? (
        <CustomerForm
          key={editing === 'new' ? 'new' : editing.id}
          customer={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('customers.search')}
        aria-label={t('customers.search')}
        className="min-h-12 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
      />
      <ErrorMessage error={customers.error} />
      {customers.data?.length === 0 ? (
        <p className="py-6 text-center text-slate-500">{t('customers.empty')}</p>
      ) : null}
      {customers.data?.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {customers.data.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="block w-full text-left active:bg-slate-50"
                  onClick={() => setEditing(customer)}
                >
                  <ListRow
                    title={customer.name}
                    subtitle={customer.phone ?? undefined}
                    trailing="›"
                  />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

function CustomerForm({ customer, onDone }: { customer: Customer | null; onDone: () => void }) {
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
