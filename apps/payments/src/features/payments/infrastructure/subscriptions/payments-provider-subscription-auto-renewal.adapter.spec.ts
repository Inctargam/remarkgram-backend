import { describe, expect, it, vi } from 'vitest';
import type { SetProviderSubscriptionAutoRenewalUseCase } from '../../application/use-cases/set-provider-subscription-auto-renewal/set-provider-subscription-auto-renewal.use-case.js';
import { PaymentProvider } from '../../domain/payment-provider.factory.js';
import { PaymentsProviderSubscriptionAutoRenewalAdapter } from './payments-provider-subscription-auto-renewal.adapter.js';

describe('PaymentsProviderSubscriptionAutoRenewalAdapter', () => {
  it.each([
    ['enable', true],
    ['disable', false],
  ] as const)('maps D2 %s to the D1 provider capability', async (method, autoRenewalEnabled) => {
    const execute = vi
      .fn<SetProviderSubscriptionAutoRenewalUseCase['execute']>()
      .mockResolvedValue({ providerSubscriptionId: 'sub_test', autoRenewalEnabled });
    const adapter = new PaymentsProviderSubscriptionAutoRenewalAdapter({ execute } as never);

    await expect(
      adapter[method]({
        provider: 'STRIPE',
        providerSubscriptionId: 'sub_test',
        autoRenewalChangeId: 'change-1',
      }),
    ).resolves.toEqual({ providerSubscriptionId: 'sub_test', autoRenewalEnabled });
    expect(execute).toHaveBeenCalledWith({
      provider: PaymentProvider.STRIPE,
      providerSubscriptionId: 'sub_test',
      autoRenewalEnabled,
      autoRenewalChangeId: 'change-1',
    });
  });
});
