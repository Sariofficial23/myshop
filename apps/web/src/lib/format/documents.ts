import { DocumentPrefix, formatDocumentNumber } from '@myshop/shared';
import type { StockMovement } from '../api/stock';

/** Документ-источник движения товара: номер (ПР-3, ПД-12…) и ссылка на него. */
export function movementDocument(m: StockMovement): { label: string; href: string } | null {
  const docs = [
    [m.purchase, DocumentPrefix.PURCHASE, '/purchases'],
    [m.sale, DocumentPrefix.SALE, '/sales'],
    [m.return, DocumentPrefix.RETURN, '/returns'],
    [m.transfer, DocumentPrefix.TRANSFER, '/transfers'],
    [m.writeOff, DocumentPrefix.WRITE_OFF, '/write-offs'],
    [m.inventory, DocumentPrefix.INVENTORY, '/inventories'],
  ] as const;
  for (const [ref, prefix, base] of docs) {
    if (ref) return { label: formatDocumentNumber(prefix, ref.number), href: `${base}/${ref.id}` };
  }
  return null;
}
