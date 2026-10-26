import { RenewalPaymentContextUnavailableError } from '../../application/errors/renewal-payment-context-unavailable.error.js';
import { PaymentWorkflowAttemptError, type PaymentWorkflowAttemptFailure } from './payment-workflow-attempt.error.js';
import { Error as DbosErrors } from '@dbos-inc/dbos-sdk';
import { PaymentsError, PaymentsErrorCode } from '../../../../common/application/errors/payments.error.js';
import type { PaymentEventFailure } from '../../application/ports/payment-event.repository.js';

const RETRYABLE_PAYMENT_ERROR_CODES = new Set<PaymentsErrorCode>([
  PaymentsErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
  PaymentsErrorCode.PAYMENT_PROVIDER_OUTCOME_UNKNOWN,
  PaymentsErrorCode.PAYMENT_CUSTOMER_PROVIDER_FAILED,
  PaymentsErrorCode.PAYMENT_SUBSCRIPTION_CONTEXT_FAILED,
  PaymentsErrorCode.PAYMENT_PLAN_UNAVAILABLE,
  PaymentsErrorCode.PAYMENT_PERSISTENCE_FAILED,
]);

/**
 * Единственное место с правилами классификации ошибок:
 * RETRY — операция допускает повтор; DEAD — обработку события нужно завершить;
 * RECONCILIATION_REQUIRED — требуется отдельное восстановление или разбор контекста.
 * Возвращает только безопасные данные для аудита, без исходных SQL/provider-сообщений.
 */
export const classifyPaymentWorkflowError = (error: unknown): PaymentWorkflowAttemptFailure => {
  // При replay используем сохранённое решение, даже если прототип исходной ошибки утрачен.
  const recorded = PaymentWorkflowAttemptError.read(error);
  if (recorded) return recorded;
  if (error instanceof RenewalPaymentContextUnavailableError) {
    // Отсутствующие привязки могут появиться после обработки другого события.
    // Отсутствие metadata или исчезновение Payment требуют reconciliation.
    const requiresReconciliation =
      error.reason === 'SOURCE_METADATA_MISSING' || error.reason === 'PAYMENT_DISAPPEARED';
    return {
      disposition: requiresReconciliation ? 'RECONCILIATION_REQUIRED' : 'RETRY',
      failure: { code: `RENEWAL_${error.reason}`, message: `Renewal payment context: ${error.reason}` },
    };
  }
  // Лимит provider step уже исчерпан: новый цикл повторов здесь не создаём.
  if (error instanceof DbosErrors.DBOSMaxStepRetriesError) {
    return {
      disposition: 'DEAD',
      failure: {
        code: 'DBOS_STEP_RETRIES_EXHAUSTED',
        message: 'Payment webhook provider step exhausted its retry policy',
      },
    };
  }
  if (error instanceof PaymentsError) {
    return {
      disposition: RETRYABLE_PAYMENT_ERROR_CODES.has(error.code) ? 'RETRY' : 'DEAD',
      failure: { code: error.code, message: `Payment webhook processing failed with ${error.code}` },
    };
  }
  // Неизвестную ошибку считаем повторяемой: отсутствие классификации не должно терять событие.
  return {
    disposition: 'RETRY',
    failure: { code: 'UNEXPECTED_WORKFLOW_ERROR', message: 'Payment webhook processing failed unexpectedly' },
  };
};

// Удобные представления одного решения: для shouldRetry и для записи audit-ошибки.
// Дополнительных правил классификации в этих функциях нет.
export const isRetryablePaymentWorkflowError = (error: unknown): boolean =>
  classifyPaymentWorkflowError(error).disposition === 'RETRY';

export const toPaymentEventFailure = (error: unknown): PaymentEventFailure =>
  classifyPaymentWorkflowError(error).failure;
