import type { CheckoutPurpose, PaymentProvider, PaymentType } from '../../domain/payment.entity.js';
import type { PeriodUnit } from '../../../plans/domain/plan.entity.js';

export type TransactionContext = unknown;
export type SuccessfulPayment = {
  paymentId: string;
  userId: number;
  planId: number;
  type: PaymentType;
  checkoutPurpose: CheckoutPurpose | null;
  provider: PaymentProvider;
  providerSubscriptionId?: string;
  currentSubscriptionId?: string;
  periodCount: number;
  periodUnit: PeriodUnit;
  autoRenewalRequested: boolean;
  paidAt: Date;
};
export type SubscriptionPaymentResult = {
  subscriptionId: string;
  action: 'CREATED' | 'SCHEDULED' | 'RENEWED';
};
export abstract class SubscriptionPaymentHandler {
  abstract applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: TransactionContext,
  ): Promise<SubscriptionPaymentResult>;
}

export class SubscriptionPaymentUnavailableError extends Error {}

export class InvalidSubscriptionPaymentResultError extends Error {}
