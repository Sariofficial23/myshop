import { type InputHTMLAttributes, useId } from 'react';
import { cn } from './cn';

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** Поле ввода с подписью. Высота 48px — удобно нажимать пальцем. */
export function TextField({ label, hint, error, className, id, ...props }: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const describedBy = error || hint ? `${inputId}-desc` : undefined;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'min-h-12 rounded-2xl bg-white px-4 text-base ring-1 ring-slate-200 outline-none',
          'focus:ring-2 focus:ring-brand-600 disabled:bg-slate-50 disabled:text-slate-500',
          error && 'ring-red-400',
        )}
        {...props}
      />
      {error || hint ? (
        <p id={describedBy} className={cn('text-sm', error ? 'text-red-600' : 'text-slate-500')}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
}
