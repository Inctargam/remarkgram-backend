import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '../../domain/payment-provider.factory.js';
import { SetProviderSubscriptionAutoRenewalUseCase } from '../../application/use-cases/set-provider-subscription-auto-renewal/set-provider-subscription-auto-renewal.use-case.js';

export type ChangeProviderSubscriptionAutoRenewalCommand = {
  provider: 'STRIPE';
  providerSubscriptionId: string;
  autoRenewalChangeId: string;
};

export type ChangeProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};

/** D1 capability adapter intended for a future D2-owned outbound boundary. */
@Injectable()
export class PaymentsProviderSubscriptionAutoRenewalAdapter {
  constructor(private readonly setProviderSubscriptionAutoRenewal: SetProviderSubscriptionAutoRenewalUseCase) {
  }

  enable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult> {
    return this.execute(command, true);
  }

  disable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult> {
    return this.execute(command, false);
  }

  private execute(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
    autoRenewalEnabled: boolean,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult> {
    return this.setProviderSubscriptionAutoRenewal.execute({
      provider: this.toPaymentProvider(command.provider),
      providerSubscriptionId: command.providerSubscriptionId,
      autoRenewalEnabled,
      autoRenewalChangeId: command.autoRenewalChangeId,
    });
  }

  private toPaymentProvider(provider: ChangeProviderSubscriptionAutoRenewalCommand['provider']): PaymentProvider {
    switch (provider) {
      case 'STRIPE':
        return PaymentProvider.STRIPE;
    }
  }
}
