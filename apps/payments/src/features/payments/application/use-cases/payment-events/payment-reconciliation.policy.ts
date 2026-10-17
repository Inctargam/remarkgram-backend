export type ProviderReferencePair = readonly [current: string | null, incoming: string | null];

export const PAYMENT_RECONCILIATION_CONFLICT = {
  PURPOSE_MISMATCH: 'PURPOSE_MISMATCH',
  PROVIDER_MISMATCH: 'PROVIDER_MISMATCH',
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  CURRENCY_MISMATCH: 'CURRENCY_MISMATCH',
  CUSTOMER_MISMATCH: 'CUSTOMER_MISMATCH',
  REFERENCE_CONFLICT: 'REFERENCE_CONFLICT',
} as const;

export type PaymentReconciliationConflict =
  (typeof PAYMENT_RECONCILIATION_CONFLICT)[keyof typeof PAYMENT_RECONCILIATION_CONFLICT];

export function hasProviderReferenceConflict(...references: readonly ProviderReferencePair[]): boolean {
  return references.some(
    ([current, incoming]) => current !== null && incoming !== null && current !== incoming,
  );
}
