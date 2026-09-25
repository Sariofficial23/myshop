'use client';

import { Button, Card, SelectField, TextField } from '@myshop/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { transfersApi } from '@/lib/api/documents';
import { useMe } from '@/lib/auth/auth-provider';

export default function NewTransferPage() {
  const t = useTranslations();
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const targets = useQuery({ queryKey: ['transfer-targets'], queryFn: transfersApi.targets });
  const [fromBranchId, setFromBranchId] = useState(me.branches[0]?.id ?? '');
  const [toBranchId, setToBranchId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const destinations = (targets.data ?? []).filter((b) => b.id !== fromBranchId);
  const valid = fromBranchId !== '' && toBranchId !== '' && linesValid(lines);

  const save = useMutation({
    mutationFn: () =>
      transfersApi.create({
        fromBranchId,
        toBranchId,
        notes: notes.trim() || null,
        items: toStockLineInputs(lines),
      }),
    onSuccess: async (transfer) => {
      await Promise.all(
        ['transfers', 'stock', 'serials', 'products'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.replace(`/transfers/${transfer.id}`);
    },
  });

  return (
    <>
      <PageHeader title={t('transfers.new')} backHref="/transfers" backLabel={t('common.back')} />
      <Card>
        <div className="flex flex-col gap-3">
          <SelectField
            label={t('transfers.from')}
            value={fromBranchId}
            onChange={(e) => {
              setFromBranchId(e.target.value);
              if (e.target.value === toBranchId) setToBranchId('');
              // IMEI привязаны к филиалу-отправителю — выбор номеров сбрасывается
              setLines((current) => current.map((line) => ({ ...line, serials: [] })));
            }}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <SelectField
            label={t('transfers.to')}
            value={toBranchId}
            onChange={(e) => setToBranchId(e.target.value)}
            options={[
              { value: '', label: t('transfers.chooseBranch') },
              ...destinations.map((b) => ({ value: b.id, label: b.name })),
            ]}
          />
          {showErrors && !toBranchId ? (
            <p className="text-sm text-red-600">{t('transfers.chooseBranch')}</p>
          ) : null}
          {targets.data && destinations.length === 0 ? (
            <p className="text-sm text-slate-500">{t('transfers.noOtherBranches')}</p>
          ) : null}
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
        branchId={fromBranchId}
        lines={lines}
        onChange={setLines}
        showErrors={showErrors}
      />

      <Card>
        <p className="text-sm text-slate-500">{t('transfers.hint')}</p>
        <div className="mt-3 flex flex-col gap-2">
          <ErrorMessage error={save.error} />
          <Button
            block
            disabled={save.isPending}
            onClick={() => {
              setShowErrors(true);
              if (valid) save.mutate();
            }}
          >
            {t('transfers.submit')}
          </Button>
        </div>
      </Card>
    </>
  );
}
