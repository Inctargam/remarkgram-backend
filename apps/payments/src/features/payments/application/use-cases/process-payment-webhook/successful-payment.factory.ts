import { InvalidPaymentStateError } from '../../../domain/errors/payment-validation.errors.js';
import { PaymentStatus, type Payment } from '../../../domain/payment.entity.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';

/** Builds the durable payment-webhook inter-step DTO from committed Payment state. */
export function createSuccessfulPayment(payment: Payment): SuccessfulPayment {
  if (payment.status !== PaymentStatus.SUCCEEDED)
    throw new InvalidPaymentStateError('status', payment.status);
  if (payment.paidAt === null) throw new InvalidPaymentStateError('paidAt', payment.paidAt);

  return {
    paymentId: payment.id,
    userId: payment.userId,
    planId: payment.planId,
    type: payment.type,
    autoRenewalRequested: payment.autoRenewalRequested,
    amount: payment.amount,
    currency: payment.currency,
    periodCount: payment.periodCount,
    periodUnit: payment.periodUnit,
    provider: payment.providerType,
    providerCustomerId: payment.providerCustomerId,
    providerSubscriptionId: payment.providerSubscriptionId,
    paidAt: payment.paidAt.toISOString(),
  };
}
