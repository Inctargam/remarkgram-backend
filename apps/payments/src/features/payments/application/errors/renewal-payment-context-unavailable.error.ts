import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

export type RenewalPaymentContextUnavailableReason =
  | 'SOURCE_METADATA_MISSING'
  | 'SOURCE_PAYMENT_NOT_FOUND'
  | 'SOURCE_NOT_LINKED'
  | 'INVOICE_PAYMENT_NOT_FOUND'
  | 'PAYMENT_DISAPPEARED';

/** Application context failure; infrastructure decides between bounded retry and reconciliation. */
export class RenewalPaymentContextUnavailableError extends PaymentsError {
  readonly code = PaymentsErrorCode.RENEWAL_PAYMENT_CONTEXT_UNAVAILABLE;

  constructor(
    readonly providerInvoiceId: string,
    readonly reason: RenewalPaymentContextUnavailableReason,
  ) {
    super(`Renewal context is unavailable for Invoice ${providerInvoiceId}: ${reason}`);
  }
}
