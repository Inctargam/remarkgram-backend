import type { PaymentEvent } from '../events/payment-event.js';
import type { PaymentsTransactionContext } from './payments-unit-of-work.js';

export type PersistPaymentEventResult = {
  id: string;
};

export type PaymentEventFailure = {
  code: string;
  message: string;
};

/**
 * Persists the observable business state of webhook processing.
 * DBOS owns scheduling, concurrency, retries and recovery; this repository
 * deliberately contains no claim, lease or fencing-token operations.
 */
export abstract class PaymentEventRepository {
  abstract saveIfAbsent(
    event: PaymentEvent,
    workflowId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<PersistPaymentEventResult>;
  abstract recordAttempt(
    eventId: string,
    attempt: number,
    ctx: PaymentsTransactionContext,
  ): Promise<void>;
  abstract attachPayment(
    eventId: string,
    paymentId: string,
    ctx: PaymentsTransactionContext,
  ): Promise<void>;
  abstract markProcessed(eventId: string, ctx: PaymentsTransactionContext): Promise<void>;
  abstract markIgnored(
    eventId: string,
    reason: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void>;
  abstract markRetrying(
    eventId: string,
    failure: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void>;
  abstract markDead(
    eventId: string,
    failure: PaymentEventFailure,
    ctx: PaymentsTransactionContext,
  ): Promise<void>;
}
