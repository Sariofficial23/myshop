'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, CheckboxField, StatusBadge, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { type Branch, branchesApi } from '@/lib/api/company';
import { useAuth, useCan } from '@/lib/auth/auth-provider';

export default function BranchesPage() {
  const t = useTranslations();
  const canManage = useCan()(Permission.BRANCHES_MANAGE);
  const [showInactive, setShowInactive] = useState(false);
  const [adding, setAdding] = useState(false);
  const branches = useQuery({
    queryKey: ['branches', { showInactive }],
    queryFn: () => branchesApi.list(showInactive),
  });

  return (
    <>
      <PageHeader title={t('branches.title')} backHref="/more" backLabel={t('common.back')} />

      {canManage ? (
        adding ? (
          <BranchForm onDone={() => setAdding(false)} />
        ) : (
          <Button block onClick={() => setAdding(true)}>
            + {t('branches.add')}
          </Button>
        )
      ) : null}

      <ErrorMessage error={branches.error} />
      {branches.data?.length === 0 ? (
        <p className="text-center text-slate-500">{t('branches.empty')}</p>
      ) : null}
      {branches.data?.map((branch) => (
        <BranchItem key={branch.id} branch={branch} canManage={canManage} />
      ))}

      {canManage ? (
        <CheckboxField
          label={t('branches.showInactive')}
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
      ) : null}
    </>
  );
}

function BranchItem({ branch, canManage }: { branch: Branch; canManage: boolean }) {
  const t = useTranslations();
  const [editing, setEditing] = useState(false);
  if (editing) return <BranchForm branch={branch} onDone={() => setEditing(false)} />;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-semibold">{branch.name}</p>
          {branch.address ? <p className="text-slate-600">{branch.address}</p> : null}
          {branch.phone ? <p className="text-slate-600">{branch.phone}</p> : null}
        </div>
        {!branch.isActive ? <StatusBadge tone="neutral">{t('common.inactive')}</StatusBadge> : null}
      </div>
      {canManage ? (
        <Button variant="secondary" block className="mt-3" onClick={() => setEditing(true)}>
          {t('common.edit')}
        </Button>
      ) : null}
    </Card>
  );
}

function BranchForm({ branch, onDone }: { branch?: Branch; onDone: () => void }) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const { reloadMe } = useAuth();
  const [form, setForm] = useState({
    name: branch?.name ?? '',
    address: branch?.address ?? '',
    phone: branch?.phone ?? '',
    isActive: branch?.isActive ?? true,
  });
  const save = useMutation({
    mutationFn: () =>
      branch
        ? branchesApi.update(branch.id, form)
        : branchesApi.create({ name: form.name, address: form.address, phone: form.phone }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['branches'] });
      await reloadMe();
      onDone();
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Card title={branch ? branch.name : t('branches.new')}>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <TextField
          label={t('branches.name')}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
          minLength={2}
          maxLength={200}
        />
        <TextField
          label={`${t('branches.address')} (${t('common.optional')})`}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          maxLength={500}
        />
        <TextField
          label={`${t('branches.phone')} (${t('common.optional')})`}
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          maxLength={32}
        />
        {branch ? (
          <CheckboxField
            label={t('branches.isActive')}
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
        ) : null}
        <ErrorMessage error={save.error} />
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" className="flex-1" disabled={save.isPending}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
