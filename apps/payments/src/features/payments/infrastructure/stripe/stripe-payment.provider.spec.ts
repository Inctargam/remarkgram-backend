import Stripe from 'stripe';
import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import { InvalidProviderEventError } from '../../application/errors/invalid-provider-event.error.js';
import { PaymentProviderUnavailableError } from '../../application/errors/payment-provider.error.js';
import type { CreateProviderCheckoutInput } from '../../application/ports/payment-provider.js';
import { CheckoutPurpose } from '../../domain/payment.entity.js';
import { StripePaymentProvider } from './stripe-payment.provider.js';

const input: CreateProviderCheckoutInput = {
  paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  amount: 10_000,
  currency: Currency.USD,
  periodCount: 1,
  periodUnit: PeriodUnit.MONTH,
  operationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  customerId: 'cus_test',
  checkoutPurpose: CheckoutPurpose.INITIAL_SUBSCRIPTION,
};

describe('StripePaymentProvider.createCheckout', () => {
  it('создает recurring Checkout для первой подписки', async () => {
    const { provider, createSession } = providerWithStripe();

    await provider.createCheckout(input);

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        subscription_data: { metadata: { paymentId: input.paymentId } },
        line_items: [
          expect.objectContaining({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            price_data: expect.objectContaining({
              recurring: { interval: 'month', interval_count: 1 },
            }),
          }),
        ],
      }),
      { idempotencyKey: `checkout:STRIPE:${input.operationId}` },
    );
  });

  it('создает разовую оплату для докупки существующей подписки', async () => {
    const { provider, createSession } = providerWithStripe();

    await provider.createCheckout({ ...input, checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        payment_intent_data: { metadata: { paymentId: input.paymentId } },
      }),
      { idempotencyKey: `checkout:STRIPE:${input.operationId}` },
    );
  });
});

describe('StripePaymentProvider.scheduleSubscriptionCancellation', () => {
  it('устанавливает cancel_at_period_end без немедленной отмены Subscription', async () => {
    const { provider } = providerWithStripe();
    const update = vi.fn().mockResolvedValue({
      id: 'sub_previous',
      cancel_at_period_end: true,
    });
    Object.assign(provider as unknown as Record<string, unknown>, {
      stripe: { subscriptions: { update } },
    });

    await expect(provider.scheduleSubscriptionCancellation('sub_previous')).resolves.toEqual({
      providerSubscriptionId: 'sub_previous',
      cancelAtPeriodEnd: true,
    });
    expect(update).toHaveBeenCalledWith(
      'sub_previous',
      { cancel_at_period_end: true },
      { idempotencyKey: 'subscription:cancel-at-period-end:sub_previous' },
    );
  });
});

describe('StripePaymentProvider.setSubscriptionAutoRenewal', () => {
  it.each([
    [true, false],
    [false, true],
  ])('преобразует autoRenewalEnabled=%s в cancel_at_period_end=%s', async (enabled, cancelAtPeriodEnd) => {
    const { provider } = providerWithStripe();
    const update = vi.fn().mockResolvedValue({
      id: 'sub_test',
      cancel_at_period_end: cancelAtPeriodEnd,
    });
    Object.assign(provider as unknown as Record<string, unknown>, {
      stripe: { subscriptions: { update } },
    });

    await expect(
      provider.setSubscriptionAutoRenewal({
        providerSubscriptionId: 'sub_test',
        autoRenewalEnabled: enabled,
        autoRenewalChangeId: 'auto-renewal-change-1',
      }),
    ).resolves.toEqual({
      providerSubscriptionId: 'sub_test',
      autoRenewalEnabled: enabled,
    });
    expect(update).toHaveBeenCalledWith(
      'sub_test',
      { cancel_at_period_end: cancelAtPeriodEnd },
      {
        idempotencyKey: `subscription-auto-renewal:auto-renewal-change-1:${enabled ? 'enable' : 'disable'}`,
      },
    );
  });
});

describe('StripePaymentProvider.createDeferredSubscription', () => {
  it('создаёт Subscription с будущим billing anchor без proration', async () => {
    const { provider } = providerWithStripe();
    const createProduct = vi.fn().mockResolvedValue({ id: 'prod_test' });
    const createSubscription = vi.fn().mockResolvedValue({ id: 'sub_new' });
    Object.assign(provider as unknown as Record<string, unknown>, {
      stripe: {
        products: { create: createProduct },
        subscriptions: { create: createSubscription },
      },
    });

    await expect(
      provider.createDeferredSubscription({
        paymentId: input.paymentId,
        subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        customerId: input.customerId,
        amount: input.amount,
        currency: input.currency,
        periodCount: input.periodCount,
        periodUnit: input.periodUnit,
        billingCycleAnchor: '2026-11-14T10:00:00.000Z',
        operationId: input.paymentId,
      }),
    ).resolves.toEqual({ providerSubscriptionId: 'sub_new' });
    expect(createProduct).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          paymentId: input.paymentId,
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
      }),
      { idempotencyKey: `subscription-product:${input.paymentId}` },
    );
    expect(createSubscription).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: input.customerId,
        billing_cycle_anchor: Math.floor(new Date('2026-11-14T10:00:00.000Z').getTime() / 1000),
        proration_behavior: 'none',
        metadata: {
          paymentId: input.paymentId,
          subscriptionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        items: [expect.objectContaining({ price_data: expect.objectContaining({ product: 'prod_test' }) })],
      }),
      { idempotencyKey: `subscription:create:${input.paymentId}` },
    );
  });
});

describe('StripePaymentProvider.verifyWebhook', () => {
  it('после проверки подписи возвращает нейтральную оболочку без интерпретации payload', () => {
    const rawEvent = checkoutEvent('checkout.session.completed', { payment_status: 'paid' });
    const provider = providerWithEvent(rawEvent);

    expect(provider.verifyWebhook(Buffer.from('{}'), 'valid-signature')).toEqual(
      expect.objectContaining({
        id: 'evt_test',
        type: 'checkout.session.completed',
        createdAt: new Date('2026-10-11T12:00:00.000Z'),
        payload: rawEvent.data.object,
        snapshot: rawEvent,
      }),
    );
  });

  it('не фильтрует неподдерживаемый тип события', () => {
    const provider = providerWithEvent({
      id: 'evt_invoice',
      type: 'invoice.paid',
      created: 1_791_720_000,
      data: { object: {} },
    });

    expect(provider.verifyWebhook(Buffer.from('{}'), 'valid-signature')).toEqual(
      expect.objectContaining({ id: 'evt_invoice', type: 'invoice.paid', payload: {} }),
    );
  });

  it('классифицирует ошибку подписи как невалидное provider-событие', () => {
    const provider = providerWithWebhookError(
      new Stripe.errors.StripeSignatureVerificationError('signature', '{}'),
    );

    expect(() => provider.verifyWebhook(Buffer.from('{}'), 'invalid-signature')).toThrow(
      InvalidProviderEventError,
    );
  });

  it('классифицирует неожиданный сбой верификации как временную недоступность provider', () => {
    const provider = providerWithWebhookError(new Error('unexpected verification failure'));

    expect(() => provider.verifyWebhook(Buffer.from('{}'), 'signature')).toThrow(
      PaymentProviderUnavailableError,
    );
  });
});

function providerWithStripe() {
  const provider = new StripePaymentProvider({
    secretKey: 'sk_test_fake',
    webhookSecret: 'whsec_fake',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  });
  const createSession = vi.fn().mockResolvedValue({
    id: 'cs_test',
    url: 'https://checkout.stripe.com/test',
    mode: 'subscription',
    payment_intent: null,
    subscription: 'sub_test',
    payment_status: 'unpaid',
    status: 'open',
    expires_at: 1_900_000_000,
  });

  // В тесте подменяется только внешний SDK: бизнес-параметры запроса остаются реальными.
  Object.assign(provider as unknown as Record<string, unknown>, {
    stripe: {
      checkout: { sessions: { create: createSession } },
    },
  });

  return { provider, createSession };
}

function providerWithEvent(event: Record<string, unknown>) {
  const provider = new StripePaymentProvider({
    secretKey: 'sk_test_fake',
    webhookSecret: 'whsec_fake',
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
  });

  Object.assign(provider as unknown as Record<string, unknown>, {
    stripe: {
      webhooks: { constructEvent: vi.fn().mockReturnValue(event) },
    },
  });
  return provider;
}

function providerWithWebhookError(error: Error) {
  const provider = providerWithEvent({});
  Object.assign(provider as unknown as Record<string, unknown>, {
    stripe: {
      webhooks: {
        constructEvent: vi.fn().mockImplementation(() => {
          throw error;
        }),
      },
    },
  });
  return provider;
}

function checkoutEvent(type: string, override: Record<string, unknown> = {}) {
  return {
    id: 'evt_test',
    type,
    created: 1_791_720_000,
    data: {
      object: {
        id: 'cs_test',
        customer: input.customerId,
        mode: 'payment',
        payment_status: 'paid',
        payment_intent: 'pi_test',
        subscription: null,
        invoice: null,
        amount_total: input.amount,
        currency: input.currency.toLowerCase(),
        metadata: { paymentId: input.paymentId },
        ...override,
      },
    },
  };
}
