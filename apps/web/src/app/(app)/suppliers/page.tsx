'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, ListRow, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { suppliersApi } from '@/lib/api/stock';
import { useCan } from '@/lib/auth/auth-provider';

/** Поставщики — минимальный список. Карточка с историей закупок — этап 7. */
export default function SuppliersPage() {
  const t = useTranslations();
  const canManage = useCan()(Permission.SUPPLIERS_MANAGE);
  const queryClient = useQueryClient();
  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: suppliersApi.list });
  const [form, setForm] = useState({ name: '', phone: '', contact: '' });
  const create = useMutation({
    mutationFn: () => suppliersApi.create(form),
    onSuccess: async () => {
      setForm({ name: '', phone: '', contact: '' });
      await queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <>
      <PageHeader title={t('suppliers.title')} backHref="/more" backLabel={t('common.back')} />
      {canManage ? (
        <Card title={t('suppliers.add')}>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <TextField
              label={t('suppliers.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              maxLength={200}
            />
            <TextField
              label={`${t('suppliers.phone')} (${t('common.optional')})`}
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              maxLength={32}
            />
            <TextField
              label={`${t('suppliers.contact')} (${t('common.optional')})`}
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
              maxLength={200}
            />
            <ErrorMessage error={create.error} />
            <Button type="submit" block disabled={create.isPending}>
              {t('common.add')}
            </Button>
          </form>
        </Card>
      ) : null}
      <ErrorMessage error={suppliers.error} />
      {suppliers.data?.length === 0 ? (
        <p className="text-center text-slate-500">{t('suppliers.empty')}</p>
      ) : null}
      {suppliers.data?.length ? (
        <Card className="p-0">
          <ul className="divide-y divide-slate-100">
            {suppliers.data.map((s) => (
              <li key={s.id}>
                <ListRow
                  title={s.name}
                  subtitle={[s.contact, s.phone].filter(Boolean).join(' · ') || undefined}
                />
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
