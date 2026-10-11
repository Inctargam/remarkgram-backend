import { Injectable } from '@nestjs/common';
import type { PaymentEvent } from '../events/payment-event.js';
import { PaymentEventRepository, type SavePaymentEventResult } from '../ports/payment-event.repository.js';

@Injectable()
export class ReceivePaymentEventUseCase {
  constructor(private readonly events: PaymentEventRepository) {}

  execute(event: PaymentEvent): Promise<SavePaymentEventResult> {
    return this.events.saveIfAbsent(event);
  }
}
