'use client';

import { Button, Card, cn, TextField } from '@myshop/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ShieldCheck, ShoppingBag } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { AppIcon } from '@/components/icons/app-icon';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { ApiError } from '@/lib/api/api-error';
import { adminApi } from '@/lib/api/admin';
import { authApi } from '@/lib/api/auth';
import { useAuth } from '@/lib/auth/auth-provider';
import { publicEnv } from '@/lib/env';

type Tab = 'owner' | 'staff';

/** Экран входа: владелец (вход / регистрация бизнеса) или сотрудник. */
export function LoginScreen({ error }: { error?: unknown }) {
  const t = useTranslations();
  const { inTelegram } = useAuth();
  const [tab, setTab] = useState<Tab>('owner');
  const isAdmin = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: adminApi.me,
    enabled: inTelegram,
    retry: false,
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 pt-6 pb-10">
      <header className="flex justify-end">
        <LocaleSwitcher />
      </header>
      <div className="flex flex-col items-center gap-3 text-center">
        <AppIcon icon={ShoppingBag} tint="blue" size="lg" className="size-16 rounded-[18px]" />
        <div>
          <h1 className="text-[28px] font-bold">{t('app.name')}</h1>
          <p className="text-[15px] text-[#8e8e93]">{t('auth.tagline')}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#e3e3e8] p-0.5">
        {(['owner', 'staff'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              'min-h-10 rounded-[10px] text-[15px] font-semibold',
              tab === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600',
            )}
          >
            {t(`auth.tab_${value}`)}
          </button>
        ))}
      </div>

      <ErrorMessage error={error} />
      {tab === 'owner' ? <OwnerAuth /> : <StaffLogin />}

      {isAdmin.data ? (
        <Link
          href="/admin"
          className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white font-semibold ring-1 ring-black/5"
        >
          <ShieldCheck aria-hidden size={20} className="text-brand-600" />
          {t('admin.open')}
        </Link>
      ) : null}
      {publicEnv.devLogin ? <DevLogin /> : null}
    </main>
  );
}

function OwnerAuth() {
  const t = useTranslations('auth');
  const { loginOwner } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({ mutationFn: () => loginOwner({ email, password }) });

  if (mode === 'register') return <RegisterWizard onCancel={() => setMode('login')} />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };
  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <TextField
          label={t('email')}
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <ErrorMessage error={login.error} />
        <Button type="submit" block disabled={login.isPending}>
          {t('signIn')}
        </Button>
        <button
          type="button"
          className="min-h-11 text-[15px] font-semibold text-brand-600"
          onClick={() => setMode('register')}
        >
          {t('registerBusiness')}
        </button>
      </form>
    </Card>
  );
}

const STEPS = ['brand', 'email', 'password'] as const;

/** Регистрация бизнеса в три шага: бренд → email (логин) → пароль. */
function RegisterWizard({ onCancel }: { onCancel: () => void }) {
  const t = useTranslations('auth');
  const { register } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ companyName: '', email: '', password: '', repeat: '' });
  const [mismatch, setMismatch] = useState(false);
  const submit = useMutation({
    mutationFn: () =>
      register({ companyName: form.companyName, email: form.email, password: form.password }),
    onError: (error) => {
      // Возвращаем на шаг с проблемой
      if (error instanceof ApiError && error.code === 'DUPLICATE_COMPANY_NAME') setStep(0);
      if (error instanceof ApiError && error.code === 'EMAIL_TAKEN') setStep(1);
    },
  });
  const current = STEPS[step]!;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (current !== 'password') {
      setStep(step + 1);
      return;
    }
    if (form.password !== form.repeat) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    submit.mutate();
  };

  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <div className="flex items-center justify-between">
          <button
            type="button"
            aria-label={t('back')}
            onClick={() => (step === 0 ? onCancel() : setStep(step - 1))}
            className="-ml-2 flex min-h-10 items-center text-[15px] font-medium text-brand-600"
          >
            <ChevronLeft aria-hidden size={22} />
            {t('back')}
          </button>
          <span className="text-[13px] text-[#8e8e93]">
            {t('step', { current: step + 1, total: STEPS.length })}
          </span>
        </div>
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={cn('h-1 flex-1 rounded-full', i <= step ? 'bg-brand-600' : 'bg-[#e3e3e8]')}
            />
          ))}
        </div>
        <h2 className="mt-1 text-[22px] font-bold">{t(`register_${current}_title`)}</h2>
        <p className="-mt-2 text-[15px] text-[#8e8e93]">{t(`register_${current}_hint`)}</p>

        {current === 'brand' ? (
          <TextField
            label={t('brand')}
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
            required
            minLength={2}
            maxLength={200}
          />
        ) : null}
        {current === 'email' ? (
          <TextField
            label={t('email')}
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        ) : null}
        {current === 'password' ? (
          <>
            <TextField
              label={t('password')}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={6}
              maxLength={128}
            />
            <TextField
              label={t('passwordRepeat')}
              type="password"
              autoComplete="new-password"
              value={form.repeat}
              onChange={(e) => setForm({ ...form, repeat: e.target.value })}
              required
              error={mismatch ? t('passwordMismatch') : undefined}
            />
          </>
        ) : null}
        <ErrorMessage error={submit.error} />
        <Button type="submit" block disabled={submit.isPending}>
          {current === 'password' ? t('createAccount') : t('next')}
        </Button>
      </form>
    </Card>
  );
}

function StaffLogin() {
  const t = useTranslations('auth');
  const { loginStaff } = useAuth();
  const [form, setForm] = useState({ companyName: '', login: '', password: '' });
  const login = useMutation({ mutationFn: () => loginStaff(form) });
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };
  return (
    <Card>
      <form className="flex flex-col gap-3" onSubmit={onSubmit}>
        <TextField
          label={t('brand')}
          hint={t('staffBrandHint')}
          value={form.companyName}
          onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          required
        />
        <TextField
          label={t('login')}
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          value={form.login}
          onChange={(e) => setForm({ ...form, login: e.target.value })}
          required
        />
        <TextField
          label={t('password')}
          type="password"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          required
        />
        <ErrorMessage error={login.error} />
        <Button type="submit" block disabled={login.isPending}>
          {t('signIn')}
        </Button>
        <p className="text-center text-[13px] text-[#8e8e93]">{t('staffHint')}</p>
      </form>
    </Card>
  );
}

function DevLogin() {
  const t = useTranslations();
  const { loginDev } = useAuth();
  const users = useQuery({
    queryKey: ['auth', 'dev-users'],
    queryFn: authApi.devUsers,
    retry: false,
  });
  const login = useMutation({ mutationFn: loginDev });

  return (
    <Card title={t('auth.devLoginTitle')}>
      <p className="mb-3 text-sm text-slate-500">{t('auth.devLoginHint')}</p>
      <ErrorMessage error={users.error ?? login.error} />
      <div className="flex flex-col gap-2">
        {users.data?.map((user) => (
          <Button
            key={`${user.companyId}-${user.telegramId}`}
            variant="secondary"
            block
            disabled={login.isPending}
            onClick={() => login.mutate(user.telegramId)}
            className="justify-between"
          >
            <span>{user.name}</span>
            <span className="text-sm font-normal text-slate-500">
              {t(`roles.${user.role}`)} · {user.companyName}
            </span>
          </Button>
        ))}
      </div>
    </Card>
  );
}
