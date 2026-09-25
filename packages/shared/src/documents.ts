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
} as const;

export function formatDocumentNumber(prefix: string, number: number): string {
  return `${prefix}-${number}`;
}
