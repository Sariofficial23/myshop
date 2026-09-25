/** Операция по кассе, не связанная с продажей. */
export const CashOperationType = {
  DEPOSIT: 'DEPOSIT',
  WITHDRAWAL: 'WITHDRAWAL',
  EXPENSE: 'EXPENSE',
} as const;

export type CashOperationType = (typeof CashOperationType)[keyof typeof CashOperationType];

export const CASH_OPERATION_TYPES: readonly CashOperationType[] = Object.values(CashOperationType);

export const InstallmentStatus = {
  ACTIVE: 'ACTIVE',
  PAID: 'PAID',
} as const;

export type InstallmentStatus = (typeof InstallmentStatus)[keyof typeof InstallmentStatus];

/** Статус гарантийного обращения. */
export const WarrantyClaimStatus = {
  RECEIVED: 'RECEIVED',
  IN_REPAIR: 'IN_REPAIR',
  READY: 'READY',
  RETURNED: 'RETURNED',
  REJECTED: 'REJECTED',
} as const;

export type WarrantyClaimStatus = (typeof WarrantyClaimStatus)[keyof typeof WarrantyClaimStatus];

export const WARRANTY_CLAIM_STATUSES: readonly WarrantyClaimStatus[] =
  Object.values(WarrantyClaimStatus);

/**
 * Допустимые переходы статуса обращения: принят → в ремонте → готов → выдан;
 * отказать можно, пока устройство не выдано. Выданное и отказанное — закрыты.
 */
export const WARRANTY_TRANSITIONS: Readonly<
  Record<WarrantyClaimStatus, readonly WarrantyClaimStatus[]>
> = {
  RECEIVED: ['IN_REPAIR', 'READY', 'REJECTED'],
  IN_REPAIR: ['READY', 'REJECTED'],
  READY: ['RETURNED'],
  RETURNED: [],
  REJECTED: [],
};

export function canTransitionWarranty(from: WarrantyClaimStatus, to: WarrantyClaimStatus): boolean {
  return WARRANTY_TRANSITIONS[from].includes(to);
}
