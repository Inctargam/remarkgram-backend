import type { Payment as PrismaPayment } from '../../../database/prisma/generated/client.js';
import { Currency, PeriodUnit } from '../../plans/domain/plan.entity.js';
import { Payment, PaymentProvider, PaymentStatus } from '../domain/payment.entity.js';

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
      providerType: row.providerType as PaymentProvider,
      idempotentKey: row.idempotentKey,
      providerCheckoutId: row.providerCheckoutId,
      providerPaymentId: row.providerPaymentId,
      providerSnapshot: row.providerSnapshot as Record<string, unknown> | null,
      subscriptionId: row.subscriptionId,
      status: row.status as PaymentStatus,
      createdAt: row.createdAt,
      paidAt: row.paidAt,
    });
  }
}
