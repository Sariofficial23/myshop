import Link from 'next/link';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  backHref,
  backLabel,
  action,
}: {
  title: string;
  backHref?: string;
  backLabel?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-center gap-2">
      {backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          className="grid size-11 place-items-center rounded-2xl bg-white text-xl ring-1 ring-slate-200"
        >
          ←
        </Link>
      ) : null}
      <h1 className="flex-1 truncate text-2xl font-bold">{title}</h1>
      {action}
    </header>
  );
}
