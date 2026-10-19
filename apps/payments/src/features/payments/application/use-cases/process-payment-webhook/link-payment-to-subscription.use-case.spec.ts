import { describe, expect, it, vi } from 'vitest';
import { Currency, PeriodUnit } from '../../../../plans/domain/plan.entity.js';
import {
  CheckoutPurpose,
  Payment,
  PaymentProvider,
  PaymentStatus,
  PaymentType,
} from '../../../domain/payment.entity.js';
import { PaymentSubscriptionApplicationConflictError } from '../../errors/payment-subscription-application.error.js';
import type { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentsRepository } from '../../ports/payments.repository.js';
import type { SubscriptionPaymentHandler } from '../../ports/subscription-payment.handler.js';
import { LinkPaymentToSubscriptionUseCase } from './link-payment-to-subscription.use-case.js';
import { createSuccessfulPayment } from './successful-payment.factory.js';

describe('LinkPaymentToSubscriptionUseCase workflow step', () => {
  it('atomically links a CREATED subscription and completes the webhook', async () => {
    const fixture = createFixture();
    fixture.subscriptions.applySuccessfulPayment.mockResolvedValue({
      subscriptionId: SUBSCRIPTION_ID,
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-11-14T12:00:00.000Z',
      previousProviderSubscriptionId: null,
    });

    await expect(fixture.useCase.execute(fixture.params, fixture.ctx)).resolves.toEqual({
      outcome: 'FINISHED',
    });
    expect(fixture.subscriptions.applySuccessfulPayment).toHaveBeenCalledWith(
      fixture.params.payment,
      fixture.ctx,
    );
    expect(fixture.payments.linkSuccessfulPaymentToSubscription).toHaveBeenCalledWith(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_ID },
      fixture.ctx,
    );
    expect(fixture.events.attachPayment).toHaveBeenCalledWith('event-id', PAYMENT_ID, fixture.ctx);
    expect(fixture.events.markProcessed).toHaveBeenCalledWith('event-id', fixture.ctx);
  });

  it('returns the durable context for a SCHEDULED transition without completing the webhook', async () => {
    const fixture = createFixture();
    fixture.subscriptions.applySuccessfulPayment.mockResolvedValue({
      subscriptionId: SUBSCRIPTION_ID,
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-11-14T12:00:00.000Z',
      previousProviderSubscriptionId: 'sub_previous',
    });

    await expect(fixture.useCase.execute(fixture.params, fixture.ctx)).resolves.toEqual({
      outcome: 'SCHEDULED',
      eventId: 'event-id',
      payment: fixture.params.payment,
      subscriptionId: SUBSCRIPTION_ID,
      nextSubscriptionStartsAt: '2026-11-14T12:00:00.000Z',
      previousProviderSubscriptionId: 'sub_previous',
    });
    expect(fixture.events.markProcessed).not.toHaveBeenCalled();
  });

  it('rejects an invalid SCHEDULED result before binding the payment', async () => {
    const fixture = createFixture();
    fixture.subscriptions.applySuccessfulPayment.mockResolvedValue({
      subscriptionId: SUBSCRIPTION_ID,
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-11-14T12:00:00.000Z',
      previousProviderSubscriptionId: null,
    });

    await expect(fixture.useCase.execute(fixture.params, fixture.ctx)).rejects.toBeInstanceOf(
      PaymentSubscriptionApplicationConflictError,
    );
    expect(fixture.payments.linkSuccessfulPaymentToSubscription).not.toHaveBeenCalled();
    expect(fixture.events.attachPayment).not.toHaveBeenCalled();
  });

  it('rejects a non-UTC nextSubscriptionStartsAt before binding the payment', async () => {
    const fixture = createFixture();
    fixture.subscriptions.applySuccessfulPayment.mockResolvedValue({
      subscriptionId: SUBSCRIPTION_ID,
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: '2026-11-14T14:00:00.000+02:00',
      previousProviderSubscriptionId: 'sub_previous',
    });

    await expect(fixture.useCase.execute(fixture.params, fixture.ctx)).rejects.toMatchObject({
      reason: 'INVALID_HANDLER_RESULT',
    });
    expect(fixture.payments.linkSuccessfulPaymentToSubscription).not.toHaveBeenCalled();
  });

  it('откатывает транзакцию, если Payment уже связан с subscription-A, а handler вернул subscription-B', async () => {
    const fixture = createFixture(SUBSCRIPTION_A_ID);
    fixture.subscriptions.applySuccessfulPayment.mockResolvedValue({
      subscriptionId: SUBSCRIPTION_B_ID,
      action: 'CREATED',
      nextSubscriptionStartsAt: '2026-11-14T12:00:00.000Z',
      previousProviderSubscriptionId: null,
    });
    fixture.payments.linkSuccessfulPaymentToSubscription.mockResolvedValue({
      outcome: 'NOT_LINKED',
    });

    await expect(fixture.useCase.execute(fixture.params, fixture.ctx)).rejects.toMatchObject({
      reason: 'PAYMENT_LINK_CONFLICT',
    });
    expect(fixture.payments.linkSuccessfulPaymentToSubscription).toHaveBeenCalledWith(
      { paymentId: PAYMENT_ID, subscriptionId: SUBSCRIPTION_B_ID },
      fixture.ctx,
    );
    expect(fixture.events.attachPayment).not.toHaveBeenCalled();
    expect(fixture.events.markProcessed).not.toHaveBeenCalled();
  });
});

const PAYMENT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBSCRIPTION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUBSCRIPTION_A_ID = SUBSCRIPTION_ID;
const SUBSCRIPTION_B_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function createFixture(subscriptionId: string | null = null) {
  const payment = Payment.restore({
    id: PAYMENT_ID,
    userId: 42,
    planId: 7,
    amount: 10_000,
    currency: Currency.USD,
    periodCount: 1,
    periodUnit: PeriodUnit.MONTH,
    providerType: PaymentProvider.STRIPE,
    idempotentKey: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    providerCheckoutId: 'cs_test',
    providerPaymentId: 'pi_test',
    providerSubscriptionId: null,
    providerInvoiceId: null,
    providerCustomerId: 'cus_test',
    checkoutExpiresAt: null,
    providerSnapshot: null,
    subscriptionId,
    targetSubscriptionId: SUBSCRIPTION_ID,
    status: PaymentStatus.SUCCEEDED,
    createdAt: new Date('2026-10-14T11:00:00.000Z'),
    paidAt: new Date('2026-10-14T12:00:00.000Z'),
    type: PaymentType.PURCHASE,
    checkoutPurpose: CheckoutPurpose.SUBSCRIPTION_EXTENSION,
    autoRenewalRequested: true,
  });
  const payments = {
    findById: vi.fn<PaymentsRepository['findById']>().mockResolvedValue(payment),
    linkSuccessfulPaymentToSubscription: vi
      .fn<PaymentsRepository['linkSuccessfulPaymentToSubscription']>()
      .mockResolvedValue({ outcome: 'LINKED' }),
  };
  const events = {
    attachPayment: vi.fn<PaymentEventRepository['attachPayment']>().mockResolvedValue(),
    markProcessed: vi.fn<PaymentEventRepository['markProcessed']>().mockResolvedValue(),
  };
  const subscriptions = {
    applySuccessfulPayment: vi.fn<SubscriptionPaymentHandler['applySuccessfulPayment']>(),
  };
  const ctx = {};
  const params = { eventId: 'event-id', payment: createSuccessfulPayment(payment) };

  return {
    useCase: new LinkPaymentToSubscriptionUseCase(
      payments as unknown as PaymentsRepository,
      events as unknown as PaymentEventRepository,
      subscriptions as unknown as SubscriptionPaymentHandler,
    ),
    payments,
    events,
    subscriptions,
    ctx,
    params,
  };
}
