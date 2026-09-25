'use client';

import { Permission } from '@myshop/shared';
import { Button, Card, cn, ListRow, SelectField, StatusBadge, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import { catalogApi } from '@/lib/api/catalog';
import { useCan } from '@/lib/auth/auth-provider';

type Tab = 'categories' | 'brands';

export default function CatalogPage() {
  const t = useTranslations('catalog');
  const tc = useTranslations('common');
  const [tab, setTab] = useState<Tab>('categories');
  return (
    <>
      <PageHeader title={t('title')} backHref="/more" backLabel={tc('back')} />
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1" role="tablist">
        {(['categories', 'brands'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'min-h-11 rounded-xl text-sm font-semibold',
              tab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
            )}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {tab === 'categories' ? <Categories /> : <Brands />}
    </>
  );
}

function Categories() {
  const t = useTranslations();
  const canManage = useCan()(Permission.PRODUCTS_MANAGE);
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories', 'all'],
    queryFn: () => catalogApi.categories(true),
  });
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['categories'] });

  const create = useMutation({
    mutationFn: () => catalogApi.createCategory({ name, parentId: parentId || null }),
    onSuccess: async () => {
      setName('');
      setParentId('');
      await invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      catalogApi.updateCategory(id, { isActive }),
    onSuccess: invalidate,
  });

  const byId = new Map(categories.data?.map((c) => [c.id, c.name]));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    create.mutate();
  };

  return (
    <>
      {canManage ? (
        <Card title={t('catalog.newCategory')}>
          <form className="flex flex-col gap-3" onSubmit={onSubmit}>
            <TextField
              label={t('products.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
            <SelectField
              label={t('catalog.parent')}
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              options={[
                { value: '', label: t('products.none') },
                ...(categories.data ?? [])
                  .filter((c) => c.isActive)
                  .map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
            <ErrorMessage error={create.error} />
            <Button type="submit" block disabled={create.isPending}>
              {t('common.add')}
            </Button>
          </form>
        </Card>
      ) : null}
      <ErrorMessage error={categories.error ?? toggle.error} />
      <NamedList
        items={(categories.data ?? []).map((c) => ({
          id: c.id,
          title: c.parentId ? `${byId.get(c.parentId) ?? ''} › ${c.name}` : c.name,
          count: c.productsCount,
          isActive: c.isActive,
        }))}
        canManage={canManage}
        onToggle={(id, isActive) => toggle.mutate({ id, isActive })}
      />
    </>
  );
}

function Brands() {
  const t = useTranslations();
  const canManage = useCan()(Permission.PRODUCTS_MANAGE);
  const queryClient = useQueryClient();
  const brands = useQuery({ queryKey: ['brands', 'all'], queryFn: () => catalogApi.brands(true) });
  const [name, setName] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['brands'] });

  const create = useMutation({
    mutationFn: () => catalogApi.createBrand({ name }),
    onSuccess: async () => {
      setName('');
      await invalidate();
    },
  });
  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      catalogApi.updateBrand(id, { isActive }),
    onSuccess: invalidate,
  });

  return (
    <>
      {canManage ? (
        <Card title={t('catalog.newBrand')}>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <TextField
              className="flex-1"
              label={t('products.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
            <Button type="submit" disabled={create.isPending}>
              {t('common.add')}
            </Button>
          </form>
          <ErrorMessage error={create.error} />
        </Card>
      ) : null}
      <ErrorMessage error={brands.error ?? toggle.error} />
      <NamedList
        items={(brands.data ?? []).map((b) => ({
          id: b.id,
          title: b.name,
          count: b.productsCount,
          isActive: b.isActive,
        }))}
        canManage={canManage}
        onToggle={(id, isActive) => toggle.mutate({ id, isActive })}
      />
    </>
  );
}

function NamedList({
  items,
  canManage,
  onToggle,
}: {
  items: Array<{ id: string; title: string; count: number; isActive: boolean }>;
  canManage: boolean;
  onToggle: (id: string, isActive: boolean) => void;
}) {
  const t = useTranslations();
  if (items.length === 0) return <p className="text-center text-slate-500">{t('catalog.empty')}</p>;
  return (
    <Card className="p-0">
      <ul className="divide-y divide-slate-100">
        {items.map((item) => (
          <li key={item.id}>
            <ListRow
              title={item.title}
              subtitle={t('catalog.productsCount', { count: item.count })}
              trailing={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => onToggle(item.id, !item.isActive)}
                    className="min-h-10 rounded-xl px-3 text-sm font-medium text-brand-600 active:bg-brand-50"
                  >
                    {item.isActive ? t('common.active') : t('common.inactive')}
                  </button>
                ) : item.isActive ? null : (
                  <StatusBadge tone="neutral">{t('common.inactive')}</StatusBadge>
                )
              }
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}
