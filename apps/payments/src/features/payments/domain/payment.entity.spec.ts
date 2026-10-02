import { describe, expect, it } from 'vitest';
import { Currency, PeriodUnit } from '../../plans/domain/plan.entity.js';
import {
  InvalidPaymentAmountError,
  InvalidPaymentIdempotentKeyError,
  InvalidPaymentStateError,
} from '../application/errors/payment.errors.js';
import { Payment, PaymentProvider, PaymentStatus, type CreatePaymentProps } from './payment.entity.js';

const props: CreatePaymentProps = {
  userId: 42,
  planId: 3,
  amount: 10_000,
  currency: Currency.USD,
  periodCount: 1,
  periodUnit: PeriodUnit.MONTH,
  providerType: PaymentProvider.STRIPE,
  idempotentKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

describe('Payment', () => {
  it('creates a local payment before provider identifiers exist', () => {
    const payment = Payment.create(props);
    expect(payment).toEqual(
      expect.objectContaining({
        ...props,
        providerCheckoutId: null,
        providerPaymentId: null,
        status: PaymentStatus.CREATED,
        createdAt: null,
        paidAt: null,
      }),
    );
    expect(payment.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it.each([0, -1, 1.5])('rejects invalid amount %s', (amount) => {
    expect(() => Payment.create({ ...props, amount })).toThrow(InvalidPaymentAmountError);
  });

  it('requires a UUID v4 idempotency key', () => {
    expect(() => Payment.create({ ...props, idempotentKey: 'not-a-uuid' })).toThrow(
      InvalidPaymentIdempotentKeyError,
    );
  });

  it.each([
    [PaymentStatus.CREATED, PaymentStatus.PENDING, true],
    [PaymentStatus.CREATED, PaymentStatus.SUCCEEDED, false],
    [PaymentStatus.PENDING, PaymentStatus.SUCCEEDED, true],
    [PaymentStatus.PENDING, PaymentStatus.FAILED, true],
    [PaymentStatus.PENDING, PaymentStatus.CANCELED, true],
    [PaymentStatus.SUCCEEDED, PaymentStatus.FAILED, false],
    [PaymentStatus.FAILED, PaymentStatus.PENDING, false],
    [PaymentStatus.SUCCEEDED, PaymentStatus.SUCCEEDED, true],
  ] as const)('transition %s -> %s is %s', (from, to, allowed) => {
    expect(Payment.canTransition(from, to)).toBe(allowed);
  });

  it('requires paidAt for a restored successful payment', () => {
    expect(() =>
      Payment.restore({
        ...props,
        id: '11111111-1111-4111-8111-111111111111',
        providerCheckoutId: 'cs_1',
        providerPaymentId: 'pi_1',
        providerSnapshot: null,
        subscriptionId: null,
        status: PaymentStatus.SUCCEEDED,
        createdAt: new Date(),
        paidAt: null,
      }),
    ).toThrow(InvalidPaymentStateError);
  });
});
