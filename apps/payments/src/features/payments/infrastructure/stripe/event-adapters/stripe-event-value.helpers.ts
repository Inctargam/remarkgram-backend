import { InvalidProviderEventError } from '../../../application/errors/invalid-provider-event.error.js';
import type { RenewalPaymentSourceReferences } from '../../../application/events/payment-event.js';

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function expandableId(value: unknown): string | null {
  if (typeof value === 'string') return value;
  return stringOrNull(asRecord(value)?.id);
}

export function metadataPaymentId(value: unknown): string | null {
  return stringOrNull(asRecord(value)?.paymentId);
}

export function safeProviderMessage(value: unknown): string | null {
  const message = stringOrNull(value);
  return message ? message.replaceAll(/[\r\n\t]+/g, ' ').slice(0, 500) : null;
}

/** Use only the Invoice's Subscription metadata snapshot, never its current remote state. */
export function invoiceRenewalSourceReferences(
  invoice: Record<string, unknown> | null,
): RenewalPaymentSourceReferences {
  const details =
    asRecord(asRecord(invoice?.parent)?.subscription_details) ?? asRecord(invoice?.subscription_details);
  const metadata = asRecord(details?.metadata);
  const sourcePaymentId = metadataIdentifier(metadata?.paymentId);
  const sourceSubscriptionId = metadataIdentifier(metadata?.subscriptionId);
  return { sourcePaymentId, sourceSubscriptionId };
}

function metadataIdentifier(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    throw new InvalidProviderEventError(
      'Stripe Invoice Subscription metadata contains an invalid identifier',
    );
  return value;
}
