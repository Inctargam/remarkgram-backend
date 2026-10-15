import type { PaymentEvent } from '../events/payment-event.js';
import type { VerifiedProviderWebhook } from './payment-provider.js';

export const PROVIDER_EVENT_ADAPTERS = Symbol('PROVIDER_EVENT_ADAPTERS');

/**
 * Inbound boundary for normalizing verified provider webhooks.
 * Outbound provider idempotency keys do not belong to this adapter.
 */
export interface ProviderEventAdapter {
  supports(webhook: VerifiedProviderWebhook): boolean;
  adapt(webhook: VerifiedProviderWebhook): PaymentEvent;
}
