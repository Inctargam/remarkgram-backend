import type { PaymentEvent } from '../events/payment-event.js';

export type SavePaymentEventResult = 'RECEIVED' | 'DUPLICATE';

export abstract class PaymentEventRepository {
  abstract saveIfAbsent(event: PaymentEvent): Promise<SavePaymentEventResult>;
}
