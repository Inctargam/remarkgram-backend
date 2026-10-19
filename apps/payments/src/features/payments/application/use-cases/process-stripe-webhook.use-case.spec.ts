import { describe, expect, it, vi } from 'vitest';
import type { PaymentEvent } from '../events/payment-event.js';
import type { PaymentProviderPort, VerifiedProviderWebhook } from '../ports/payment-provider.js';
import { PaymentProviderUnavailableError } from '../errors/payment-provider.error.js';
import { PaymentProvider } from '../../domain/payment.entity.js';
import type { ReceivePaymentEventUseCase } from './receive-payment-event.use-case.js';
import { ProcessStripeWebhookUseCase } from './process-stripe-webhook.use-case.js';

describe('ProcessStripeWebhookUseCase', () => {
  it('игнорирует неподдерживаемое событие без адаптации и сохранения', async () => {
    const verified = webhook({ type: 'invoice.paid' });
    const verifyWebhook = vi.fn().mockReturnValue(verified);
    const adapt = vi.fn();
    const execute = vi.fn();
    const useCase = new ProcessStripeWebhookUseCase(
      { verifyWebhook } as unknown as PaymentProviderPort,
      [{ supports: () => false, adapt }],
      { execute } as unknown as ReceivePaymentEventUseCase,
    );

    await expect(useCase.execute(Buffer.from('{}'), 'signature')).resolves.toBe('IGNORED');
    expect(adapt).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it('адаптирует и сохраняет поддерживаемое событие', async () => {
    const verified = webhook();
    const adapted = {} as PaymentEvent;
    const execute = vi.fn().mockResolvedValue('RECEIVED');
    const useCase = new ProcessStripeWebhookUseCase(
      { verifyWebhook: vi.fn().mockReturnValue(verified) } as unknown as PaymentProviderPort,
      [{ supports: () => true, adapt: vi.fn().mockReturnValue(adapted) }],
      { execute } as unknown as ReceivePaymentEventUseCase,
    );

    await expect(useCase.execute(Buffer.from('{}'), 'signature')).resolves.toBe('RECEIVED');
    expect(execute).toHaveBeenCalledWith(adapted);
  });

  it('не переклассифицирует ошибку, уже нормализованную provider-адаптером', async () => {
    const providerError = new PaymentProviderUnavailableError();
    const useCase = new ProcessStripeWebhookUseCase(
      {
        verifyWebhook: vi.fn().mockImplementation(() => {
          throw providerError;
        }),
      } as unknown as PaymentProviderPort,
      [],
      { execute: vi.fn() } as unknown as ReceivePaymentEventUseCase,
    );

    await expect(useCase.execute(Buffer.from('{}'), 'signature')).rejects.toBe(providerError);
  });
});

function webhook(overrides: Partial<VerifiedProviderWebhook> = {}): VerifiedProviderWebhook {
  return {
    provider: PaymentProvider.STRIPE,
    id: 'evt_test',
    type: 'checkout.session.completed',
    createdAt: new Date('2026-10-11T12:00:00.000Z'),
    payload: {},
    snapshot: {},
    ...overrides,
  };
}
