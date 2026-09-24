'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { companyApi, type Company } from '@/lib/api/company';
import { useAuth, useCan } from '@/lib/auth/auth-provider';

export default function CompanyPage() {
  const t = useTranslations();
  const company = useQuery({ queryKey: ['company'], queryFn: companyApi.current });
  return (
    <>
      <PageHeader title={t('company.title')} backHref="/more" backLabel={t('common.back')} />
      <ErrorMessage error={company.error} />
      {company.data ? <CompanyForm company={company.data} /> : null}
    </>
  );
}

function CompanyForm({ company }: { company: Company }) {
  const t = useTranslations();
  const canEdit = useCan()(Permission.COMPANY_MANAGE);
  const { reloadMe } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: company.name,
    currency: company.currency,
    timezone: company.timezone,
  });
  const save = useMutation({
    mutationFn: () => companyApi.update(form),
    onSuccess: async (updated) => {
      queryClient.setQueryData(['company'], updated);
      await reloadMe();
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <TextField
          label={t('company.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          disabled={!canEdit}
          required
          minLength={2}
        />
        <TextField
          label={t('company.currency')}
          hint={t('company.currencyHint')}
          value={form.currency}
          onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
          disabled={!canEdit}
          pattern="[A-Za-z]{3}"
          maxLength={3}
          required
        />
        <TextField
          label={t('company.timezone')}
          value={form.timezone}
          onChange={(e) => setForm({ ...form, timezone: e.target.value })}
          disabled={!canEdit}
          required
        />
        <ErrorMessage error={save.error} />
        {canEdit ? (
          <Button type="submit" block disabled={save.isPending}>
            {save.isSuccess && !save.isPending ? `✓ ${t('common.saved')}` : t('common.save')}
          </Button>
        ) : (
          <p className="text-sm text-slate-500">{t('company.readOnly')}</p>
        )}
      </form>
    </Card>
  );
}
