'use client';

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
import { inventoriesApi } from '@/lib/api/documents';
import { useMe } from '@/lib/auth/auth-provider';

export default function NewInventoryPage() {
  const t = useTranslations();
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [branchId, setBranchId] = useState(me.branches[0]?.id ?? '');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<StockLine[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const save = useMutation({
    mutationFn: (confirm: boolean) =>
      inventoriesApi.create({
        branchId,
        confirm,
        notes: notes.trim() || null,
        items: toStockLineInputs(lines),
      }),
    onSuccess: async (inventory) => {
      await Promise.all(
        ['inventories', 'stock', 'serials', 'products'].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] }),
        ),
      );
      router.replace(`/inventories/${inventory.id}`);
    },
  });
  const submit = (confirm: boolean) => {
    setShowErrors(true);
    if (branchId && linesValid(lines, true)) save.mutate(confirm);
  };

  return (
    <>
      <PageHeader
        title={t('inventories.new')}
        backHref="/inventories"
        backLabel={t('common.back')}
      />
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
          <p className="text-sm text-slate-500">{t('inventories.hint')}</p>
          <TextField
            label={`${t('stockDocs.notes')} (${t('common.optional')})`}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </div>
      </Card>

      <h2 className="text-lg font-semibold">{t('inventories.counted')}</h2>
      <StockLinesEditor
        branchId={branchId}
        lines={lines}
        onChange={setLines}
        allowZero
        showErrors={showErrors}
        quantityLabel={t('inventories.actual')}
      />

      <Card>
        <div className="flex flex-col gap-2">
          <ErrorMessage error={save.error} />
          <Button block disabled={save.isPending} onClick={() => submit(false)}>
            {t('inventories.check')}
          </Button>
          <Button block variant="secondary" disabled={save.isPending} onClick={() => submit(true)}>
            {t('inventories.confirmNow')}
          </Button>
        </div>
      </Card>
    </>
  );
}
