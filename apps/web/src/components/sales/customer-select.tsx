'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { type Customer, customersApi } from '@/lib/api/sales';
import { useCan } from '@/lib/auth/auth-provider';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';

/** Клиент продажи (необязательно): поиск по имени/телефону или быстрое создание. */
export function CustomerSelect({
  value,
  onChange,
}: {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
}) {
  const t = useTranslations('customers');
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const search = useDebouncedValue(q.trim());
  const results = useQuery({
    queryKey: ['customers', { search }],
    queryFn: () => customersApi.list(search),
    enabled: search.length >= 2 && !value,
  });
  const create = useMutation({
    mutationFn: () => customersApi.create({ name: name.trim(), phone: phone.trim() || null }),
    onSuccess: async (customer) => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] });
      setCreating(false);
      setName('');
      setPhone('');
      setQ('');
      onChange(customer);
    },
  });

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-brand-50 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-brand-800">{value.name}</p>
          {value.phone ? <p className="text-sm text-brand-800/80">{value.phone}</p> : null}
        </div>
        <button
          type="button"
          className="min-h-10 rounded-xl px-3 text-sm text-slate-600 active:bg-white"
          onClick={() => onChange(null)}
        >
          {t('change')}
        </button>
      </div>
    );
  }

  if (creating) {
    return (
      <div className="flex flex-col gap-3">
        <TextField
          label={t('name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={200}
        />
        <TextField
          label={t('phone')}
          type="tel"
          inputMode="tel"
          placeholder="+998"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          maxLength={32}
        />
        <ErrorMessage error={create.error} />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={() => setCreating(false)}>
            {t('cancel')}
          </Button>
          <Button disabled={name.trim() === '' || create.isPending} onClick={() => create.mutate()}>
            {t('save')}
          </Button>
        </div>
      </div>
    );
  }

  const options = search.length >= 2 ? (results.data ?? []) : [];
  return (
    <div className="flex flex-col gap-2">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('search')}
        aria-label={t('search')}
        className="min-h-12 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-600"
      />
      <ErrorMessage error={results.error} />
      {options.length ? (
        <Card className="p-0">
          <ul className="max-h-60 divide-y divide-slate-100 overflow-y-auto">
            {options.map((customer) => (
              <li key={customer.id}>
                <button
                  type="button"
                  className="block w-full text-left active:bg-slate-50"
                  onClick={() => onChange(customer)}
                >
                  <ListRow title={customer.name} subtitle={customer.phone ?? undefined} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
      {search.length >= 2 && results.data?.length === 0 ? (
        <p className="text-sm text-slate-500">{t('notFound')}</p>
      ) : null}
      {can(Permission.CUSTOMERS_MANAGE) ? (
        <button
          type="button"
          className="min-h-11 self-start rounded-xl px-1 text-sm font-semibold text-brand-600"
          onClick={() => {
            setCreating(true);
            if (/\d{3,}/.test(q)) setPhone(q.trim());
            else setName(q.trim());
          }}
        >
          {t('add')}
        </button>
      ) : null}
    </div>
  );
}
