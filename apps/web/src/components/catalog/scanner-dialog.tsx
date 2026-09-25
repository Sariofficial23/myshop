'use client';

import { Button, TextField } from '@myshop/ui';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { getCameraScanner } from '@/lib/scanner';

/**
 * Диалог сканирования: камера (если доступна) + ручной ввод.
 * USB/Bluetooth-сканер работает как клавиатура — просто вводит код в поле.
 * Возвращает строку штрихкода; поиск товара делает вызывающий код через backend.
 */
export function ScannerDialog({
  onResult,
  onClose,
}: {
  onResult: (code: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('scanner');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanner] = useState(() => getCameraScanner());
  const [cameraError, setCameraError] = useState(false);
  const [manual, setManual] = useState('');

  useEffect(() => {
    const video = videoRef.current;
    if (!scanner || !video) return;
    let session: { stop(): void } | undefined;
    let cancelled = false;
    scanner
      .start(video, (code) => onResult(code))
      .then((s) => {
        if (cancelled) s.stop();
        else session = s;
      })
      .catch(() => {
        if (!cancelled) setCameraError(true);
      });
    return () => {
      cancelled = true;
      session?.stop();
    };
  }, [scanner, onResult]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (manual.trim()) onResult(manual.trim());
  };

  return (
    <dialog
      open
      aria-modal="true"
      aria-label={t('title')}
      className="fixed inset-0 z-20 m-0 flex h-dvh max-h-none w-full max-w-none items-end border-0 bg-slate-900/60 p-0"
    >
      <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <p className="text-lg font-semibold">{t('title')}</p>
        {scanner && !cameraError ? (
          <video
            ref={videoRef}
            className="aspect-video w-full rounded-2xl bg-slate-900 object-cover"
            muted
            playsInline
          />
        ) : (
          <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-600">
            {cameraError ? t('cameraError') : t('unsupported')}
          </p>
        )}
        <form className="flex items-end gap-2" onSubmit={submit}>
          <TextField
            className="flex-1"
            label={t('manual')}
            inputMode="numeric"
            autoFocus={!scanner}
            value={manual}
            onChange={(e) => setManual(e.target.value)}
          />
          <Button type="submit">{t('find')}</Button>
        </form>
        <Button variant="secondary" block onClick={onClose}>
          {t('close')}
        </Button>
      </div>
    </dialog>
  );
}
