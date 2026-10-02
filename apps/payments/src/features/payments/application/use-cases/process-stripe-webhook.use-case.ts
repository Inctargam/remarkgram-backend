import { Injectable } from '@nestjs/common';
import { InvalidProviderEventError } from '../errors/payment-use-case.errors.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository, type WebhookProcessingResult } from '../ports/payments.repository.js';

@Injectable()
export class ProcessStripeWebhookUseCase {
  constructor(
    private readonly provider: PaymentProviderPort,
    private readonly payments: PaymentsRepository,
  ) {}
  async execute(rawBody: Buffer, signature: string): Promise<WebhookProcessingResult> {
    try {
      const event = this.provider.verifyWebhook(rawBody, signature);
      console.log('web-hook verify event', event);
      return await this.payments.processProviderEvent(event);
    } catch (error) {
      if (error instanceof InvalidProviderEventError) throw error;
      if (error instanceof Error && error.name.includes('Signature'))
        throw new InvalidProviderEventError('Invalid Stripe webhook signature');
      throw error;
    }
  }
}
