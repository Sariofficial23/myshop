/** Способ оплаты продажи (ТЗ, раздел 9). */
export const SalePaymentType = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'TRANSFER',
  MIXED: 'MIXED',
  INSTALLMENT: 'INSTALLMENT',
} as const;

export type SalePaymentType = (typeof SalePaymentType)[keyof typeof SalePaymentType];

/** Способ конкретного платежа. Смешанная оплата = несколько платежей разными способами. */
export const PaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  TRANSFER: 'TRANSFER',
} as const;

export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PAYMENT_METHODS: readonly PaymentMethod[] = Object.values(PaymentMethod);

/** Тип оплаты продажи по её платежам: один способ → он же, несколько → MIXED. */
export function paymentTypeOf(methods: readonly PaymentMethod[]): SalePaymentType {
  const unique = [...new Set(methods)];
  if (unique.length === 0) throw new Error('At least one payment is required');
  return unique.length === 1 ? unique[0]! : SalePaymentType.MIXED;
}
