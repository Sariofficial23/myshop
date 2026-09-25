'use client';

import { WRITE_OFF_REASONS, type WriteOffReason } from '@myshop/shared';
import { Button, Card, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ErrorMessage } from '@/components/error-message';
import { PageHeader } from '@/components/page-header';
import {
  linesValid,
  type StockLine,
  StockLinesEditor,
  toStockLineInputs,
} from '@/components/stock/stock-lines-editor';
import { writeOffsApi } from '@/lib/api/documents';
import { useMe } from '@/lib/auth/auth-provider';

export default function NewWriteOffPage() {
  const t = useTranslations();
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const [reason, setReason] = useState<WriteOffReason>('DEFECT');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      writeOffsApi.create({
        branchId,
        reason,
        notes: notes.trim() || null,
        items: toStockLineInputs(lines),
      }),
    onSuccess: async (writeOff) => {
      await Promise.all(
        ['write-offs', 'stock', 'serials', 'products'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.replace(`/write-offs/${writeOff.id}`);
    },
  });

  return (
    <>
      <PageHeader title={t('writeOffs.new')} backHref="/write-offs" backLabel={t('common.back')} />
      <Card>
        <div className="flex flex-col gap-3">
          {me.branches.length > 1 ? (
            <SelectField
              label={t('stockDocs.branch')}
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setLines((current) => current.map((line) => ({ ...line, serials: [] })));
              }}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            />
          ) : null}
          <SelectField
            label={t('writeOffs.reason')}
            value={reason}
            onChange={(e) => setReason(e.target.value as WriteOffReason)}
            options={WRITE_OFF_REASONS.map((r) => ({
              value: r,
              label: t(`writeOffReason.${r}`),
            }))}
          />
          <TextField
            label={`${t('stockDocs.notes')} (${t('common.optional')})`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </div>
      </Card>

      <h2 className="text-lg font-semibold">{t('stockDocs.items')}</h2>
      <StockLinesEditor
        branchId={branchId}
        lines={lines}
        onChange={setLines}
        showErrors={showErrors}
      />

      <Card>
        <p className="text-sm text-slate-500">{t('writeOffs.hint')}</p>
        <div className="mt-3 flex flex-col gap-2">
          <ErrorMessage error={save.error} />
          <Button
            block
            variant="danger"
            disabled={save.isPending}
            onClick={() => {
              setShowErrors(true);
              if (branchId && linesValid(lines)) save.mutate();
            }}
          >
            {t('writeOffs.submit')}
          </Button>
        </div>
      </Card>
    </>
  );
}
