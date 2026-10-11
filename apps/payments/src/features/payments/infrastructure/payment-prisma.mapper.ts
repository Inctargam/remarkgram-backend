import type { Payment as PrismaPayment } from '../../../database/prisma/generated/client.js';
import type { Currency, PeriodUnit } from '../../plans/domain/plan.entity.js';
import {
  Payment,
  type PaymentApplicationStatus,
  type CheckoutPurpose,
  type PaymentStatus,
  type PaymentType,
} from '../domain/payment.entity.js';
import { PaymentProviderFactory } from '../domain/payment-provider.factory.js';

export class PaymentPrismaMapper {
  static toDomain(row: PrismaPayment): Payment {
    return Payment.restore({
      id: row.id,
      userId: row.userId,
      planId: row.planId,
      amount: row.amount,
      currency: row.currency as Currency,
      periodCount: row.periodCount,
      periodUnit: row.periodUnit as PeriodUnit,
      providerType: PaymentProviderFactory.create(row.providerType),
      idempotentKey: row.idempotentKey,
      providerCheckoutId: row.providerCheckoutId,
      providerPaymentId: row.providerPaymentId,
      providerSubscriptionId: row.providerSubscriptionId,
      providerInvoiceId: row.providerInvoiceId,
      providerCustomerId: row.providerCustomerId,
      checkoutExpiresAt: row.checkoutExpiresAt,
      providerSnapshot: row.providerSnapshot as Record<string, unknown> | null,
      subscriptionId: row.subscriptionId,
      targetSubscriptionId: row.targetSubscriptionId,
      type: row.type as PaymentType,
      checkoutPurpose: row.checkoutPurpose as CheckoutPurpose | null,
      autoRenewalRequested: row.autoRenewalRequested,
      status: row.status as PaymentStatus,
      applicationStatus: row.applicationStatus as PaymentApplicationStatus,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    });
  }
}
