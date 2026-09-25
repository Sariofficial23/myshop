import type { Prisma } from '@myshop/database';

/**
 * Следующий номер документа в компании. Атомарно: UPDATE … value + 1 блокирует строку
 * счётчика до конца транзакции, поэтому параллельные документы не получат одинаковый номер.
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  companyId: string,
  type: string,
): Promise<number> {
  const counter = await tx.documentCounter.upsert({
    where: { companyId_type: { companyId, type } },
    create: { companyId, type, value: 1 },
    update: { value: { increment: 1 } },
  });
  return counter.value;
}
