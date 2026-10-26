import type { PaymentEventKind } from '../../domain/payment-event-kind.js';
import type { PaymentProvider } from '../../domain/payment.entity.js';

/**
 * Общая оболочка всех нормализованных событий платёжного провайдера.
 * Репозиторий может сохранить событие, не зная структуру конкретного payload.
 */
export type PaymentEventEnvelope = {
  provider: PaymentProvider;
  providerEventId: string;
  providerEventType: string;
  providerCreatedAt: Date;
  // Не каждое событие можно сразу связать с локальным Payment.
  paymentId: string | null;
};

export type CheckoutSessionCompletedEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.CHECKOUT_SESSION_COMPLETED;
  payload: {
    id: string;
    customerId: string | null;
    mode: string | null;
    paymentStatus: string | null;
    providerPaymentId: string | null;
    providerSubscriptionId: string | null;
    amount: number | null;
    currency: string | null;
  };
  snapshot: Record<string, unknown>;
};

export type CheckoutSessionExpiredEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.CHECKOUT_SESSION_EXPIRED;
  payload: {
    id: string;
    customerId: string | null;
    mode: string | null;
    amount: number | null;
    currency: string | null;
  };
  snapshot: Record<string, unknown>;
};

export type SuccessfulPaymentPayload = {
  customerId: string | null;
  amount: number;
  currency: string;
  paidAt: Date;
};

export type PaymentFailureDetails = {
  providerCode: string | null;
  declineCode: string | null;
  message: string | null;
  failedAt: Date;
};

export type PaymentIntentSucceededEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.PAYMENT_INTENT_SUCCEEDED;
  payload: SuccessfulPaymentPayload & {
    id: string;
  };
};

export type PaymentIntentPaymentFailedEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.PAYMENT_INTENT_PAYMENT_FAILED;
  payload: PaymentFailureDetails & {
    id: string;
  };
};

export type PaymentIntentCanceledEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.PAYMENT_INTENT_CANCELED;
  payload: {
    id: string;
    customerId: string | null;
    canceledAt: Date;
  };
};

/** Source purchase references copied from the Subscription metadata into this Invoice.
 * Optional fields keep previously persisted normalized events readable; a new renewal
 * without source context requires reconciliation rather than a historical-payment fallback.
 */
export type RenewalPaymentSourceReferences = {
  sourcePaymentId?: string | null;
  sourceSubscriptionId?: string | null;
};

export type InvoiceFinalizedEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.INVOICE_FINALIZED;
  payload: RenewalPaymentSourceReferences & {
    providerInvoiceId: string;
    providerSubscriptionId: string | null;
    customerId: string | null;
    billingReason: string | null;
    amount: number;
    currency: string;
  };
};

export type InvoicePaidEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.INVOICE_PAID;
  payload: SuccessfulPaymentPayload & RenewalPaymentSourceReferences & {
    id: string;
    billingReason: string | null;
    providerPaymentId: string | null;
    providerSubscriptionId: string | null;
    providerInvoiceId: string;
  };
};

export type InvoicePaymentFailedEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.INVOICE_PAYMENT_FAILED;
  payload: PaymentFailureDetails & {
    id: string;
    customerId: string | null;
    billingReason: string | null;
    providerPaymentId: string | null;
    providerSubscriptionId: string | null;
    providerInvoiceId: string;
  };
};

export type InvoiceVoidedEvent = PaymentEventEnvelope & {
  kind: PaymentEventKind.INVOICE_VOIDED;
  payload: RenewalPaymentSourceReferences & {
    providerInvoiceId: string;
    providerSubscriptionId: string | null;
    customerId: string | null;
    billingReason: string | null;
  };
};

export type SuccessfulPaymentEvent = PaymentIntentSucceededEvent | InvoicePaidEvent;
export type PaymentEvent =
  | CheckoutSessionCompletedEvent
  | CheckoutSessionExpiredEvent
  | SuccessfulPaymentEvent
  | PaymentIntentPaymentFailedEvent
  | PaymentIntentCanceledEvent
  | InvoicePaymentFailedEvent
  | InvoiceVoidedEvent
  | InvoiceFinalizedEvent;
