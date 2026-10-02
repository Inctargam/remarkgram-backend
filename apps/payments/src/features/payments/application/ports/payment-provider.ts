import type { Currency } from '../../../plans/domain/plan.entity.js';

export type CreateProviderCheckoutInput = {
  paymentId: string;
  amount: number;
  currency: Currency;
  idempotencyKey: string;
};
export type ProviderCheckout = {
  checkoutId: string;
  checkoutUrl: string;
  paymentId: string | null;
  snapshot: Record<string, unknown>;
};
export type VerifiedProviderEvent = {
  eventId: string;
  eventType: string;
  internalPaymentId: string | null;
  checkoutId: string | null;
  providerPaymentId: string | null;
  amount: number | null;
  currency: string | null;
  outcome: 'SUCCEEDED' | 'FAILED' | 'CANCELED' | 'IGNORED';
  snapshot: Record<string, unknown>;
};

export abstract class PaymentProviderPort {
  abstract createCheckout(input: CreateProviderCheckoutInput): Promise<ProviderCheckout>;
  abstract verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderEvent;
}
