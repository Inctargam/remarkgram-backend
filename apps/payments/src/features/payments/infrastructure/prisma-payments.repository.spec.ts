import { describe, expect, it } from 'vitest';
import { classifyProviderReferenceConflict } from './prisma-payments.repository.js';

describe('classifyProviderReferenceConflict', () => {
  it.each([
    [['providerType', 'providerCheckoutId'], 'CHECKOUT'],
    [['provider_type', 'provider_payment_id'], 'PAYMENT'],
    [['provider_type', 'provider_subscription_id'], 'SUBSCRIPTION'],
    [['provider_type', 'provider_invoice_id'], 'INVOICE'],
  ] as const)('classifies classic meta.target %j as %s', (target, expected) => {
    expect(classifyProviderReferenceConflict({ target })).toBe(expected);
  });

  it.each([
    [['provider_type', 'provider_checkout_id'], 'CHECKOUT'],
    [['provider_type', 'provider_payment_id'], 'PAYMENT'],
    [['provider_type', 'provider_subscription_id'], 'SUBSCRIPTION'],
    [['provider_type', 'provider_invoice_id'], 'INVOICE'],
  ] as const)('classifies adapter-pg constraint fields %j as %s', (fields, expected) => {
    expect(
      classifyProviderReferenceConflict({
        driverAdapterError: { cause: { constraint: { fields } } },
      }),
    ).toBe(expected);
  });

  it.each([
    undefined,
    {},
    { target: ['user_id', 'idempotent_key'] },
    {
      driverAdapterError: {
        cause: { constraint: { index: 'payments_provider_type_provider_checkout_id_key' } },
      },
    },
  ])('returns UNKNOWN for unsupported metadata %#', (meta) => {
    expect(classifyProviderReferenceConflict(meta)).toBe('UNKNOWN');
  });
});
