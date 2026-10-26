import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../../database/prisma.service.js';
import {
  PaymentsQueryRepository,
  type FindUserPaymentsPageParams,
  type FindUserPaymentsPageResult,
  type PaymentStatusView,
} from '../../../application/ports/payments.query-repository.js';

@Injectable()
export class PrismaPaymentsQueryRepository implements PaymentsQueryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findStatusByUserAndId(userId: number, paymentId: string): Promise<PaymentStatusView | null> {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, userId },
      select: { id: true, status: true, paidAt: true },
    });

    return payment
      ? {
          paymentId: payment.id,
          status: payment.status,
          paidAt: payment.paidAt?.toISOString(),
        }
      : null;
  }

  async findUserPaymentsPage(params: FindUserPaymentsPageParams): Promise<FindUserPaymentsPageResult> {
    const where = { userId: params.userId };
    const [payments, totalCount] = await this.prisma.$transaction(
      [
        this.prisma.payment.findMany({
          where,
          select: {
            id: true,
            planId: true,
            amount: true,
            currency: true,
            periodCount: true,
            periodUnit: true,
            providerType: true,
            type: true,
            status: true,
            createdAt: true,
            paidAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (params.pageNumber - 1) * params.pageSize,
          take: params.pageSize,
        }),
        this.prisma.payment.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );

    return {
      items: payments.map((payment) => ({
        paymentId: payment.id,
        planId: payment.planId,
        amount: payment.amount,
        currency: payment.currency,
        periodCount: payment.periodCount,
        periodUnit: payment.periodUnit,
        provider: payment.providerType,
        type: payment.type,
        status: payment.status,
        createdAt: payment.createdAt.toISOString(),
        paidAt: payment.paidAt?.toISOString(),
      })),
      totalCount,
    };
  }
}
