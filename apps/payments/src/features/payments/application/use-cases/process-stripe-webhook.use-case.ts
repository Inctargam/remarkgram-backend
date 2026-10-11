import { Inject, Injectable, Logger } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../../common/application/errors/payments.error.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PROVIDER_EVENT_ADAPTERS, type ProviderEventAdapter } from '../ports/provider-event-adapter.js';
import { ReceivePaymentEventUseCase } from './receive-payment-event.use-case.js';

// export type ProcessProviderWebhookResult = 'RECEIVED' | 'DUPLICATE' | 'IGNORED';

@Injectable()
export class ProcessStripeWebhookUseCase {
  private readonly logger = new Logger(ProcessStripeWebhookUseCase.name);
  constructor(
    private readonly provider: PaymentProviderPort,
    @Inject(PROVIDER_EVENT_ADAPTERS)
    private readonly adapters: readonly ProviderEventAdapter[],
    private readonly receivePaymentEvent: ReceivePaymentEventUseCase,
  ) {}
  async execute(rawBody: Buffer, signature: string): Promise<void> {
    try {
      const webhook = this.provider.verifyWebhook(rawBody, signature);
      const adapter = this.adapters.find((candidate) => candidate.supports(webhook));
      if (!adapter) return;
      const adapt = adapter.adapt(webhook);
      await this.receivePaymentEvent.execute(adapt);
      if (adapt.kind === 'CHECKOUT_SESSION_COMPLETED') {
        this.logger.log('statr link payment with local sub');
      }
      return;
    } catch (error) {
      if (error instanceof InvalidProviderEventError) throw error;
      if (error instanceof Error && error.name.includes('Signature'))
        throw new InvalidProviderEventError('Invalid Stripe webhook signature');
      throw error;
    }
  }
}
