export function FullScreenSpinner({ label }: { label: string }) {
  return (
    <div className="grid min-h-dvh place-items-center">
      <output aria-live="polite" className="flex flex-col items-center gap-3 text-slate-500">
        <span className="size-10 animate-spin rounded-full border-4 border-brand-100 border-t-brand-600" />
        {label}
      </output>
    </div>
  );
}
