import type { PaymentEventFailure } from '../../application/ports/payment-event.repository.js';

export type PaymentWorkflowFailureDisposition = 'RETRY' | 'RECONCILIATION_REQUIRED' | 'DEAD';
export type PaymentWorkflowAttemptFailure = {
  disposition: PaymentWorkflowFailureDisposition;
  failure: PaymentEventFailure;
};

/**
 * Сохраняет безопасное решение классификатора в Error.message перед rollback транзакции.
 * При replay datasource может вернуть обычный Error без прототипа нашего класса;
 * name и сериализованное решение позволяют прочитать прежнюю классификацию.
 */
export class PaymentWorkflowAttemptError extends Error {
  constructor(decision: PaymentWorkflowAttemptFailure) {
    super(JSON.stringify(decision));
    this.name = 'PaymentWorkflowAttemptError';
  }

  // Читаем только корректную обёртку; повреждённую классифицируют как неизвестную ошибку.
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

