import { PaymentsError, PaymentsErrorCode } from '../../../../common/domain/errors/payments.error.js';

export class InvalidProviderEventError extends PaymentsError {
  readonly code = PaymentsErrorCode.INVALID_PROVIDER_EVENT;

  constructor(message = 'Invalid payment provider event') {
    super(message);
  }
}
