import type { ReactNode } from 'react';
import { cn } from './cn';

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}

/** Строка списка с крупной зоной нажатия. Оборачивайте в ссылку/кнопку для навигации. */
export function ListRow({ title, subtitle, leading, trailing, className }: ListRowProps) {
  return (
    <div className={cn('flex min-h-14 items-center gap-3 px-4 py-3', className)}>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-base font-medium text-slate-900">{title}</span>
        {subtitle ? <span className="truncate text-sm text-slate-500">{subtitle}</span> : null}
      </span>
      {trailing ? <span className="shrink-0 text-slate-400">{trailing}</span> : null}
    </div>
  );
}
