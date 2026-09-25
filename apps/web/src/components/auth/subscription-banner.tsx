'use client';

import { TriangleAlert } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useMe } from '@/lib/auth/auth-provider';

const SOON_MS = 3 * 24 * 60 * 60 * 1000;

/** Подписка истекла (только просмотр) или скоро закончится. */
export function SubscriptionBanner() {
  const t = useTranslations('subscription');
  const format = useFormatter();
  const { subscription } = useMe().company;
  // Время фиксируется при первом рендере — баннер не «мигает» при перерисовках
  const [now] = useState(() => Date.now());
  const until = subscription.paidUntil ? new Date(subscription.paidUntil) : null;
  const soon = until !== null && until.getTime() - now < SOON_MS;
  if (subscription.state !== 'EXPIRED' && !soon) return null;
  const expired = subscription.state === 'EXPIRED';
  return (
    <output
      className={
        expired
          ? 'flex items-start gap-3 rounded-2xl bg-[#fff1f0] p-3 text-[#c41d12]'
          : 'flex items-start gap-3 rounded-2xl bg-[#fff8e6] p-3 text-[#9a6700]'
      }
    >
      <TriangleAlert aria-hidden size={20} className="mt-0.5 shrink-0" />
      <p className="text-[15px]">
        {expired
          ? t('expired')
          : t('endsSoon', { date: format.dateTime(until!, { dateStyle: 'medium' }) })}
      </p>
    </output>
  );
}
