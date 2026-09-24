import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
}

export function Card({ title, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn('rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70', className)}
      {...props}
    >
      {title ? <h2 className="mb-3 text-base font-semibold text-slate-900">{title}</h2> : null}
      {children}
    </div>
  );
}
