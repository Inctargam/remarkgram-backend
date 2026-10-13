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
