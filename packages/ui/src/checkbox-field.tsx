import { type InputHTMLAttributes, type ReactNode, useId } from 'react';
import { cn } from './cn';

export interface CheckboxFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
}

export function CheckboxField({ label, description, className, id, ...props }: CheckboxFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <label
      htmlFor={inputId}
      className={cn(
        'flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-2 ring-1 ring-slate-200',
        className,
      )}
    >
      <input id={inputId} type="checkbox" className="size-5 accent-brand-600" {...props} />
      <span className="flex flex-col">
        <span className="text-base">{label}</span>
        {description ? <span className="text-sm text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}
