import type { Payment } from '../../domain/payment.entity.js';

/** Serializable snapshot passed from financial reconciliation to subscription processing. */
export type SuccessfulPayment = Readonly<{
  paymentId: string;
  userId: number;
  planId: number;
  type: Payment['type'];
  checkoutPurpose: Payment['checkoutPurpose'];
  autoRenewalRequested: Payment['autoRenewalRequested'];
  targetSubscriptionId: string | null;
  amount: number;
  currency: Payment['currency'];
  periodCount: number;
  periodUnit: Payment['periodUnit'];
  provider: Payment['providerType'];
  providerCustomerId: string | null;
  paidAt: string;
}>;
