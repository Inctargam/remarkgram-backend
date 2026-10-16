import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentProviderResultMismatchError } from '../../../../../common/application/errors/payments.error.js';
import { PaymentProvider } from '../../../domain/payment-provider.factory.js';
import type { PaymentProviderPort } from '../../ports/payment-provider.js';
import { SetProviderSubscriptionAutoRenewalUseCase } from './set-provider-subscription-auto-renewal.use-case.js';

describe('SetProviderSubscriptionAutoRenewalUseCase', () => {
  const setSubscriptionAutoRenewal = vi.fn<PaymentProviderPort['setSubscriptionAutoRenewal']>();
  const useCase = new SetProviderSubscriptionAutoRenewalUseCase({
    setSubscriptionAutoRenewal,
  } as unknown as PaymentProviderPort);

  beforeEach(() => {
    setSubscriptionAutoRenewal.mockReset();
  });

  it.each([
    [true, 'enable'],
    [false, 'disable'],
  ] as const)('передаёт autoRenewalEnabled=%s провайдеру идемпотентно', async (enabled, action) => {
    setSubscriptionAutoRenewal.mockResolvedValue({
      providerSubscriptionId: 'sub_test',
      autoRenewalEnabled: enabled,
    });

    await expect(
      useCase.execute({
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: 'sub_test',
        autoRenewalEnabled: enabled,
        autoRenewalChangeId: 'auto-renewal-change-1',
      }),
    ).resolves.toEqual({
      providerSubscriptionId: 'sub_test',
      autoRenewalEnabled: enabled,
    });
    expect(setSubscriptionAutoRenewal).toHaveBeenCalledWith({
      providerSubscriptionId: 'sub_test',
      autoRenewalEnabled: enabled,
      autoRenewalChangeId: 'auto-renewal-change-1',
    });
  });

  it('отклоняет несовместимый ответ провайдера', async () => {
    setSubscriptionAutoRenewal.mockResolvedValue({
      providerSubscriptionId: 'sub_other',
      autoRenewalEnabled: true,
    });

    await expect(
      useCase.execute({
        provider: PaymentProvider.STRIPE,
        providerSubscriptionId: 'sub_test',
        autoRenewalEnabled: true,
        autoRenewalChangeId: 'auto-renewal-change-1',
      }),
    ).rejects.toBeInstanceOf(PaymentProviderResultMismatchError);
  });
});
