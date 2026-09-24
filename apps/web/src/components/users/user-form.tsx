'use client';

import { assignableRoles, GRANTABLE_PERMISSIONS, Permission, type Role } from '@myshop/shared';
import { Button, Card, CheckboxField, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { permissionMessageKey } from '@/i18n/keys';
import { type StaffInput, type StaffMember, usersApi } from '@/lib/api/company';
import { useCan, useMe } from '@/lib/auth/auth-provider';

function toggle(list: string[], value: string, on: boolean): string[] {
  return on ? [...new Set([...list, value])] : list.filter((v) => v !== value);
}

/**
 * Форма сотрудника (создание и редактирование).
 * Список ролей, филиалов и прав ограничен тем, что может выдать текущий пользователь,
 * но окончательную проверку делает backend.
 */
export function UserForm({ user }: { user?: StaffMember }) {
  const t = useTranslations();
  const me = useMe();
  const can = useCan();
  const router = useRouter();
  const queryClient = useQueryClient();

  const roles = assignableRoles(me.role);
  const isSelf = user?.id === me.user.id;
  const canManage = can(Permission.USERS_MANAGE);
  const canEditAccess = canManage && !isSelf && (!user || roles.includes(user.role));
  const canEditProfile = canManage && (!user || isSelf || roles.includes(user.role));
  const grantable = GRANTABLE_PERMISSIONS.filter((p) => me.permissions.includes(p));

  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
    phone: user?.phone ?? '',
    telegramId: user?.telegramId ?? '',
    role: (user?.role ?? roles.at(-1) ?? 'SELLER') as Role,
    allBranches: user?.allBranches ?? false,
    branchIds: user?.branches.map((b) => b.id) ?? [],
    extraPermissions: user?.extraPermissions ?? [],
    isActive: user?.isActive ?? true,
  });

  const save = useMutation({
    mutationFn: () => {
      const profile: StaffInput = {
        firstName: form.firstName,
        lastName: form.lastName,
        phone: form.phone,
        ...(user?.telegramId ? {} : { telegramId: form.telegramId || null }),
      };
      const access: StaffInput = canEditAccess
        ? {
            role: form.role,
            allBranches: form.allBranches,
            branchIds: form.allBranches ? [] : form.branchIds,
            extraPermissions: form.extraPermissions,
            ...(user ? { isActive: form.isActive } : {}),
          }
        : {};
      if (user && profile.telegramId === null) delete profile.telegramId;
      return user
        ? usersApi.update(user.id, { ...profile, ...access })
        : usersApi.create({ ...profile, ...access });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      router.push('/users');
    },
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <Card>
        <div className="flex flex-col gap-3">
          <TextField
            label={t('users.firstName')}
            value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            disabled={!canEditProfile}
            required
            maxLength={100}
          />
          <TextField
            label={`${t('users.lastName')} (${t('common.optional')})`}
            value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            disabled={!canEditProfile}
            maxLength={100}
          />
          <TextField
            label={`${t('users.phone')} (${t('common.optional')})`}
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            disabled={!canEditProfile}
            maxLength={32}
          />
          <TextField
            label={t('users.telegramId')}
            hint={user?.telegramId ? t('users.telegramLinked') : t('users.telegramIdHint')}
            inputMode="numeric"
            pattern="\d{1,20}"
            value={form.telegramId}
            onChange={(e) => setForm({ ...form, telegramId: e.target.value.replace(/\D/g, '') })}
            disabled={!canEditProfile || Boolean(user?.telegramId)}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <SelectField
            label={t('users.role')}
            value={form.role}
            disabled={!canEditAccess}
            onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
            options={(canEditAccess ? roles : [form.role]).map((role) => ({
              value: role,
              label: t(`roles.${role}`),
            }))}
          />

          <p className="text-sm font-medium text-slate-700">{t('users.branches')}</p>
          <CheckboxField
            label={t('users.allBranches')}
            description={t('users.allBranchesHint')}
            checked={form.allBranches}
            disabled={!canEditAccess || !me.allBranches}
            onChange={(e) => setForm({ ...form, allBranches: e.target.checked })}
          />
          {!form.allBranches
            ? me.branches.map((branch) => (
                <CheckboxField
                  key={branch.id}
                  label={branch.name}
                  checked={form.branchIds.includes(branch.id)}
                  disabled={!canEditAccess}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      branchIds: toggle(form.branchIds, branch.id, e.target.checked),
                    })
                  }
                />
              ))
            : null}

          {grantable.length ? (
            <>
              <p className="text-sm font-medium text-slate-700">{t('users.extraPermissions')}</p>
              {grantable.map((permission) => (
                <CheckboxField
                  key={permission}
                  label={t(permissionMessageKey(permission))}
                  checked={form.extraPermissions.includes(permission)}
                  disabled={!canEditAccess}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      extraPermissions: toggle(form.extraPermissions, permission, e.target.checked),
                    })
                  }
                />
              ))}
            </>
          ) : null}

          {user && !isSelf ? (
            <CheckboxField
              label={t('users.isActive')}
              checked={form.isActive}
              disabled={!canEditAccess}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
          ) : null}
        </div>
      </Card>

      {user && !canEditAccess && !isSelf ? (
        <p className="text-sm text-slate-500">{t('users.readOnly')}</p>
      ) : null}
      <ErrorMessage error={save.error} />
      {canEditProfile ? (
        <Button type="submit" block disabled={save.isPending}>
          {user ? t('common.save') : t('common.add')}
        </Button>
      ) : null}
    </form>
  );
}
