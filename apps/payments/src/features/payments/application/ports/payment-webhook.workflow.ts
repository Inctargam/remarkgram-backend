import type { PaymentEvent } from '../events/payment-event.js';

export type EnqueuePaymentWebhookResult = 'RECEIVED';

/** Durable boundary for accepting a normalized provider webhook. */
export abstract class PaymentWebhookWorkflow {
  abstract enqueue(event: PaymentEvent): Promise<EnqueuePaymentWebhookResult>;
}
