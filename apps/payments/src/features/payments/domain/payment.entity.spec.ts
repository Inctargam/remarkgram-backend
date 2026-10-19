import { describe, expect, it } from 'vitest';
import { Currency, PeriodUnit } from '../../plans/domain/plan.entity.js';
import {
  InvalidPaymentAmountError,
  InvalidPaymentIdempotentKeyError,
  InvalidPaymentStateError,
} from './errors/payment-validation.errors.js';
import {
  Payment,
  PaymentProvider,
  CheckoutPurpose,
  PaymentStatus,
  PaymentType,
  type CreatePaymentProps,
} from './payment.entity.js';
import { PaymentProviderFactory } from './payment-provider.factory.js';

const props: CreatePaymentProps = {
  userId: 42,
  planId: 3,
  amount: 10_000,
  currency: Currency.USD,
  periodCount: 1,
  periodUnit: PeriodUnit.MONTH,
  providerType: PaymentProvider.STRIPE,
  idempotentKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
  autoRenewalRequested: true,
  targetSubscriptionId: null,
};

describe('Payment', () => {
  it('maps a supported external provider to the domain enum', () => {
    expect(PaymentProviderFactory.create('STRIPE')).toBe(PaymentProvider.STRIPE);
  });

  it('rejects an unsupported external provider', () => {
    expect(() => PaymentProviderFactory.create('UNKNOWN')).toThrow('Invalid payment provider');
  });

  it('creates a local payment before provider identifiers exist', () => {
    const payment = Payment.create(props);
    expect(payment).toEqual(
      expect.objectContaining({
        ...props,
        providerCheckoutId: null,
        providerPaymentId: null,
        providerSubscriptionId: null,
        providerInvoiceId: null,
        status: PaymentStatus.CREATED,
        createdAt: null,
        paidAt: null,
      }),
    );
    expect(payment.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('does not derive targetSubscriptionId nullability from CheckoutPurpose', () => {
    expect(
      Payment.create({
        ...props,
        checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
        targetSubscriptionId: '22222222-2222-4222-8222-222222222222',
      }).targetSubscriptionId,
    ).toBe('22222222-2222-4222-8222-222222222222');
    expect(
      Payment.create({
        ...props,
        checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
        targetSubscriptionId: null,
      }).targetSubscriptionId,
    ).toBeNull();
  });

  it('allows optional targetSubscriptionId for a restored renewal', () => {
    const payment = Payment.restore({
      ...props,
      id: '11111111-1111-4111-8111-111111111111',
      providerCheckoutId: null,
      providerPaymentId: 'pi_renewal',
      providerSubscriptionId: 'sub_renewal',
      providerInvoiceId: 'in_renewal',
      providerCustomerId: 'cus_1',
      checkoutExpiresAt: null,
      providerSnapshot: null,
      subscriptionId: null,
      targetSubscriptionId: '22222222-2222-4222-8222-222222222222',
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      paidAt: null,
      type: PaymentType.RENEWAL,
      checkoutPurpose: null,
      autoRenewalRequested: null,
    });

    expect(payment.targetSubscriptionId).toBe('22222222-2222-4222-8222-222222222222');
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
    // Financial webhook may be processed before checkout.session.completed.
    [PaymentStatus.CREATED, PaymentStatus.SUCCEEDED, true],
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
        providerSubscriptionId: 'sub_1',
        providerInvoiceId: 'in_1',
        providerCustomerId: 'cus_1',
        checkoutExpiresAt: new Date(),
        providerSnapshot: null,
        subscriptionId: null,
        status: PaymentStatus.SUCCEEDED,
        createdAt: new Date(),
        paidAt: null,
        type: PaymentType.PURCHASE,
      }),
    ).toThrow(InvalidPaymentStateError);
  });

  it('restores provider subscription and invoice references', () => {
    const payment = Payment.restore({
      ...props,
      id: '11111111-1111-4111-8111-111111111111',
      providerCheckoutId: 'cs_1',
      providerPaymentId: 'pi_1',
      providerSubscriptionId: 'sub_1',
      providerInvoiceId: 'in_1',
      providerCustomerId: 'cus_1',
      checkoutExpiresAt: new Date(),
      providerSnapshot: null,
      subscriptionId: null,
      status: PaymentStatus.PENDING,
      createdAt: new Date(),
      paidAt: null,
      type: PaymentType.PURCHASE,
    });

    expect(payment.providerSubscriptionId).toBe('sub_1');
    expect(payment.providerInvoiceId).toBe('in_1');
  });
});
