import type { PaymentProvider } from '../../domain/payment.entity.js';

export type CheckoutSessionCompletedEvent = {
  kind: 'CHECKOUT_SESSION_COMPLETED';
  provider: PaymentProvider;
  providerEventId: string;
  providerEventType: 'checkout.session.completed';
  providerCreatedAt: Date;
  checkout: {
    id: string;
    internalPaymentId: string | null;
    customerId: string | null;
    mode: string | null;
    paymentStatus: string | null;
    providerPaymentId: string | null;
    providerSubscriptionId: string | null;
    providerInvoiceId: string | null;
    amount: number | null;
    currency: string | null;
  };
  snapshot: Record<string, unknown>;
};

export type PaymentEvent = CheckoutSessionCompletedEvent;
