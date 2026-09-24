import type { ReactNode } from 'react';
import { cn } from './cn';

export type StatusTone = 'success' | 'danger' | 'neutral';

const tones: Record<StatusTone, string> = {
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  neutral: 'bg-slate-50 text-slate-600 ring-slate-200',
};

const dots: Record<StatusTone, string> = {
  success: 'bg-emerald-500',
  danger: 'bg-red-500',
  neutral: 'bg-slate-400',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium ring-1',
        tones[tone],
      )}
    >
      <span aria-hidden className={cn('size-2 rounded-full', dots[tone])} />
      {children}
    </span>
  );
}
