'use client';

import { Button, Card, ListRow } from '@myshop/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { CustomerForm } from '@/components/customers/customer-form';
import { customersApi } from '@/lib/api/sales';
import { useDebouncedValue } from '@/lib/hooks/use-debounced-value';
import { useMoney } from '@/lib/hooks/use-money';

/** Клиенты: поиск, добавление, долг по рассрочкам; карточка — по нажатию. */
export default function CustomersPage() {
  const t = useTranslations();
  const money = useMoney();
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
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
          creating ? null : <Button onClick={() => setCreating(true)}>+ {t('common.add')}</Button>
        }
      />
      {creating ? <CustomerForm customer={null} onDone={() => setCreating(false)} /> : null}
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
                <Link href={`/customers/${customer.id}`} className="block active:bg-slate-50">
                  <ListRow
                    title={customer.name}
                    subtitle={customer.phone ?? undefined}
                    trailing={
                      customer.debt && Number(customer.debt) > 0 ? (
                        <span className="text-sm font-semibold text-amber-700">
                          {t('customers.debt', { value: money(customer.debt) })}
                        </span>
                      ) : (
                        '›'
                      )
                    }
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
