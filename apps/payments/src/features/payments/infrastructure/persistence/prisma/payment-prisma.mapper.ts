import type { Payment as PrismaPayment } from '../../../../../database/prisma/generated/client.js';
import type { Currency } from '../../../../../common/domain/currency.enum.js';
import type { PeriodUnit } from '../../../../../common/domain/period-unit.enum.js';
import {
  Payment,
  type CheckoutPurpose,
  type PaymentStatus,
  type PaymentType,
} from '../../../domain/payment.entity.js';
import { PaymentProviderFactory } from '../../../domain/payment-provider.factory.js';

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
      type: row.type as PaymentType,
      checkoutPurpose: row.checkoutPurpose as CheckoutPurpose | null,
      autoRenewalRequested: row.autoRenewalRequested,
      status: row.status as PaymentStatus,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    });
  }
}
