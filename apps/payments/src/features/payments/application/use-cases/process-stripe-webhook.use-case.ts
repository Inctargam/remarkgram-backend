import { Injectable, Logger } from '@nestjs/common';
import { InvalidProviderEventError } from '../../../../common/application/errors/payments.error.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository, type ReceiveWebhookResult } from '../ports/payments.repository.js';

@Injectable()
export class ProcessStripeWebhookUseCase {
  private readonly logger = new Logger(ProcessStripeWebhookUseCase.name);
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly payments: PaymentsRepository,
  ) {}
  async execute(rawBody: Buffer, signature: string): Promise<ReceiveWebhookResult> {
    try {
      const event = this.provider.verifyWebhook(rawBody, signature);
      this.logger.debug(`Verified Stripe event ${event.eventId}`);
      return await this.payments.receiveProviderEvent(event);
    } catch (error) {
      if (error instanceof InvalidProviderEventError) throw error;
      if (error instanceof Error && error.name.includes('Signature'))
        throw new InvalidProviderEventError('Invalid Stripe webhook signature');
      throw error;
    }
  }
}
