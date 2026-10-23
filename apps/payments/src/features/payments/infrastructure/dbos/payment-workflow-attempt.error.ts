import type { PaymentEventFailure } from '../../application/ports/payment-event.repository.js';

export type PaymentWorkflowFailureDisposition = 'RETRY' | 'RECONCILIATION_REQUIRED' | 'DEAD';
export type PaymentWorkflowAttemptFailure = {
  disposition: PaymentWorkflowFailureDisposition;
  failure: PaymentEventFailure;
};

/** Preserve a safe decision in Error.message: datasource replay does not preserve custom prototypes. */
export class PaymentWorkflowAttemptError extends Error {
  constructor(decision: PaymentWorkflowAttemptFailure) {
    super(JSON.stringify(decision));
    this.name = 'PaymentWorkflowAttemptError';
  }

  static read(error: unknown): PaymentWorkflowAttemptFailure | null {
    if (!(error instanceof Error) || error.name !== 'PaymentWorkflowAttemptError') return null;
    try {
      const decision = JSON.parse(error.message) as Partial<PaymentWorkflowAttemptFailure> | null;
      if (!decision || !['RETRY', 'RECONCILIATION_REQUIRED', 'DEAD'].includes(decision.disposition ?? '')) return null;
      if (typeof decision.failure?.code !== 'string' || typeof decision.failure.message !== 'string') return null;
      return decision as PaymentWorkflowAttemptFailure;
    } catch {
      return null;
    }
  }
}

/** Local control flow after the durable event outcome has been recorded. */
export class PaymentWorkflowProcessingStoppedError extends Error {}
