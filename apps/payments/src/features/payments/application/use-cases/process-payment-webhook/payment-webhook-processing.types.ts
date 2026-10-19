import type { SuccessfulPayment } from '../../types/successful-payment.types.js';

export type ApplyPaymentEventResult =
  | { outcome: 'FINISHED' }
  | { outcome: 'SUCCESSFUL_PAYMENT'; eventId: string; payment: SuccessfulPayment };
