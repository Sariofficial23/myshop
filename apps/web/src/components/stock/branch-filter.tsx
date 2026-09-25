'use client';

import { SelectField } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { useMe } from '@/lib/auth/auth-provider';

/** Выбор филиала из доступных сотруднику. Скрыт, если филиал один. */
export function BranchFilter({
  value,
  onChange,
  allowAll = true,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  allowAll?: boolean;
  label?: string;
}) {
  const t = useTranslations('stock');
  const me = useMe();
  if (me.branches.length < 2 && allowAll) return null;
  return (
    <SelectField
      label={label ?? t('branch')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      options={[
        ...(allowAll ? [{ value: '', label: t('allBranches') }] : []),
        ...me.branches.map((branch) => ({ value: branch.id, label: branch.name })),
      ]}
    />
  );
}
