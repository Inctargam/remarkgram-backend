import { Injectable } from '@nestjs/common';
import type { VerifiedProviderEvent } from '../ports/payment-provider.js';
import { PaymentsRepository, type WebhookProcessingResult } from '../ports/payments.repository.js';

@Injectable()
export class ProcessProviderWebhookUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  execute(event: VerifiedProviderEvent): Promise<WebhookProcessingResult> {
    return this.payments.processProviderEvent(event);
  }
}
