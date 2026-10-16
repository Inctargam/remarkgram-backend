import { Injectable } from '@nestjs/common';
import { PaymentProviderResultMismatchError } from '../../../../../common/application/errors/payments.error.js';
import { PaymentProviderFactory, type PaymentProvider } from '../../../domain/payment-provider.factory.js';
import { PaymentProviderPort } from '../../ports/payment-provider.js';

export type SetProviderSubscriptionAutoRenewalParams = {
  provider: PaymentProvider;
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
  /** Stable identity of one requested auto-renewal setting change across retries. */
  autoRenewalChangeId: string;
};

export type SetProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};

/** D1 boundary for changing recurring billing at a payment provider. */
@Injectable()
export class SetProviderSubscriptionAutoRenewalUseCase {
  constructor(private readonly paymentProvider: PaymentProviderPort) {}

  async execute(
    params: SetProviderSubscriptionAutoRenewalParams,
  ): Promise<SetProviderSubscriptionAutoRenewalResult> {
    PaymentProviderFactory.create(params.provider);
    const action = params.autoRenewalEnabled ? 'enable' : 'disable';
    const result = await this.paymentProvider.setSubscriptionAutoRenewal({
      providerSubscriptionId: params.providerSubscriptionId,
      autoRenewalEnabled: params.autoRenewalEnabled,
      autoRenewalChangeId: params.autoRenewalChangeId,
    });

    if (
      result.providerSubscriptionId !== params.providerSubscriptionId ||
      result.autoRenewalEnabled !== params.autoRenewalEnabled
    )
      throw new PaymentProviderResultMismatchError(`${action} subscription auto-renewal`);

    return result;
  }
}
