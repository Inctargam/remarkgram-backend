import { Injectable } from '@nestjs/common';
import type { PaymentEvent } from '../events/payment-event.js';
import {
  PaymentWebhookWorkflow,
  type EnqueuePaymentWebhookResult,
} from '../ports/payment-webhook.workflow.js';

@Injectable()
export class ReceivePaymentEventUseCase {
  constructor(private readonly workflow: PaymentWebhookWorkflow) {}

  execute(event: PaymentEvent): Promise<EnqueuePaymentWebhookResult> {
    return this.workflow.enqueue(event);
  }
}
