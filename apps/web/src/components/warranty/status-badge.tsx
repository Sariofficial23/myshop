'use client';

import type { WarrantyClaimStatus } from '@myshop/shared';
import { StatusBadge } from '@myshop/ui';
import { useTranslations } from 'next-intl';

export function WarrantyStatusBadge({ status }: { status: WarrantyClaimStatus }) {
  const t = useTranslations('warrantyStatus');
  const tone =
    status === 'READY' || status === 'RETURNED'
      ? 'success'
      : status === 'REJECTED'
        ? 'danger'
        : 'neutral';
  return <StatusBadge tone={tone}>{t(status)}</StatusBadge>;
}
