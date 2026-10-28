import {
  PaymentEventOutcome,
  PaymentEventRejectionDisposition,
  type PaymentEventCompletionCode,
  type PaymentEventRejectionReason,
  type PaymentEventResult,
} from '../../application/use-cases/payment-events/payment-event-result.js';
import type { SuccessfulPayment } from '../../application/types/successful-payment.types.js';

/** Формат уже сохранённых результатов applyPaymentWebhook до разделения outcome/code/reason. */
type LegacyPaymentEventResult =
  | { status: 'SUCCESS'; code: 'PAYMENT_SUCCEEDED'; paymentId: string; payment: SuccessfulPayment }
  | { status: 'SUCCESS'; code: PaymentEventCompletionCode; paymentId: string | null }
  | { status: 'IGNORED' | 'DEAD'; code: PaymentEventRejectionReason };

/** Читает старую DBOS history без изменения durable-имён, порядка операций или данных в БД. */
export function mapPaymentEventHistoryResult(
  result: PaymentEventResult | LegacyPaymentEventResult,
): PaymentEventResult {
  if ('outcome' in result) return result;
  if (result.status === 'SUCCESS') {
    if (result.code === 'PAYMENT_SUCCEEDED') {
      return { outcome: PaymentEventOutcome.PAYMENT_CONFIRMED, payment: result.payment };
    }
    return { outcome: PaymentEventOutcome.COMPLETED, code: result.code, paymentId: result.paymentId };
  }
  return {
    outcome: PaymentEventOutcome.REJECTED,
    disposition:
      result.status === 'IGNORED'
        ? PaymentEventRejectionDisposition.IGNORED
        : PaymentEventRejectionDisposition.DEAD,
    reason: result.code,
  };
}
