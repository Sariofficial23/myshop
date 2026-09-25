/** Статус документа (приход, продажа, перемещение, инвентаризация). */
export const DocumentStatus = {
  DRAFT: 'DRAFT',
  CONFIRMED: 'CONFIRMED',
  CANCELLED: 'CANCELLED',
} as const;

export type DocumentStatus = (typeof DocumentStatus)[keyof typeof DocumentStatus];

export const DOCUMENT_STATUSES: readonly DocumentStatus[] = Object.values(DocumentStatus);

/** Префиксы номеров документов: ПР-15 — приход №15. */
export const DocumentPrefix = {
  PURCHASE: 'ПР',
  SALE: 'ПД',
  RETURN: 'ВЗ',
  TRANSFER: 'ПМ',
  WRITE_OFF: 'СП',
  INVENTORY: 'ИН',
} as const;

/** Причина списания. */
export const WriteOffReason = {
  DEFECT: 'DEFECT',
  DAMAGE: 'DAMAGE',
  LOSS: 'LOSS',
  OTHER: 'OTHER',
} as const;

export type WriteOffReason = (typeof WriteOffReason)[keyof typeof WriteOffReason];

export const WRITE_OFF_REASONS: readonly WriteOffReason[] = Object.values(WriteOffReason);

export function formatDocumentNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}
