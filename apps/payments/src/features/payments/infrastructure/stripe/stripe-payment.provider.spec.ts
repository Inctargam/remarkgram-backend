import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../plans/domain/plan.entity.js';
import type { CreateProviderCheckoutInput } from '../../application/ports/payment-provider.js';
import { CheckoutPurpose } from '../../domain/payment.entity.js';
import { StripePaymentProvider } from './stripe-payment.provider.js';

const input: CreateProviderCheckoutInput = {
  paymentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  amount: 10_000,
  currency: Currency.USD,
  periodCount: 1,
  periodUnit: PeriodUnit.MONTH,
  idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
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
            price_data: expect.objectContaining({
              recurring: { interval: 'month', interval_count: 1 },
            }),
          }),
        ],
      }),
      { idempotencyKey: input.idempotencyKey },
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
      { idempotencyKey: input.idempotencyKey },
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
