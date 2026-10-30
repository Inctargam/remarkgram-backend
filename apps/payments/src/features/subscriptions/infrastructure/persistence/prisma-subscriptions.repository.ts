import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../../database/prisma/generated/client.js';
import type { PaymentsTransactionContext } from '../../../payments/application/ports/payments-unit-of-work.js';
import { PaymentProviderFactory } from '../../../payments/domain/payment-provider.factory.js';
import { SubscriptionsRepository } from '../../application/ports/subscriptions.repository.js';
import { SubscriptionBindingConflictError } from '../../application/errors/subscription-binding-conflict.error.js';
import type {
  BindProviderSubscriptionRepositoryParams,
  CreateSubscriptionRepositoryParams,
  RenewSubscriptionRepositoryParams,
  SetSubscriptionAutoRenewalRepositoryParams,
  SubscriptionPaymentApplication,
  SubscriptionForPayment,
  AutoRenewalOperation,
} from '../../application/types/subscriptions.types.js';
import { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import { AutoRenewalOperationStatus } from '../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';

const AUTO_RENEWAL_OPERATION_SELECT = {
  id: true,
  userId: true,
  type: true,
  status: true,
  paymentId: true,
  subscriptionId: true,
  provider: true,
  providerSubscriptionId: true,
  sourceSubscriptionId: true,
  sourceProviderSubscriptionId: true,
} satisfies Prisma.AutoRenewalOperationSelect;

@Injectable()
export class PrismaSubscriptionsRepository extends SubscriptionsRepository {
  async lockByUserId(userId: number, tx: PaymentsTransactionContext): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    const lockKey = `subscriptions:user:${userId}`;
    await client.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
    `;
  }

  async findByUserId(userId: number, tx: PaymentsTransactionContext): Promise<SubscriptionForPayment[]> {
    const client = tx as Prisma.TransactionClient;
    const subscriptions = await client.subscription.findMany({
      where: { userId },
      select: {
        id: true,
        planId: true,
        provider: true,
        providerSubscriptionId: true,
        startsAt: true,
        expiresAt: true,
        status: true,
        autoRenewalStatus: true,
      },
    });

    return subscriptions.map((subscription) => ({
      subscriptionId: subscription.id,
      planId: subscription.planId,
      provider: PaymentProviderFactory.create(subscription.provider),
      providerSubscriptionId: subscription.providerSubscriptionId,
      startsAt: subscription.startsAt,
      expiresAt: subscription.expiresAt,
      status: SubscriptionStatus[subscription.status],
      autoRenewalStatus: AutoRenewalStatus[subscription.autoRenewalStatus],
    }));
  }

  async findPaymentApplication(
    paymentId: string,
    tx: PaymentsTransactionContext,
  ): Promise<SubscriptionPaymentApplication | null> {
    const client = tx as Prisma.TransactionClient;
    const application = await client.subscriptionPaymentApplication.findUnique({
      where: { paymentId },
      select: {
        paymentId: true,
        payment: { select: { userId: true } },
        autoRenewalOperation: { select: AUTO_RENEWAL_OPERATION_SELECT },
        subscriptionId: true,
        action: true,
        nextSubscriptionStartsAt: true,
      },
    });

    if (!application) {
      return null;
    }

    return {
      paymentId: application.paymentId,
      userId: application.payment.userId,
      autoRenewalOperation: application.autoRenewalOperation
        ? this.toAutoRenewalOperation(application.autoRenewalOperation)
        : null,
      result: {
        subscriptionId: application.subscriptionId,
        action: application.action,
        nextSubscriptionStartsAt: application.nextSubscriptionStartsAt.toISOString(),
        previousProviderSubscriptionId:
          application.autoRenewalOperation?.sourceProviderSubscriptionId ?? null,
      },
    };
  }

  async confirmAutoRenewalCancellation(operationId: string, tx: PaymentsTransactionContext): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    await client.autoRenewalOperation.update({
      where: { id: operationId },
      data: {
        status: AutoRenewalOperationStatus.BINDING_PENDING,
        sourceSubscription: {
          update: {
            autoRenewalStatus: AutoRenewalStatus.RETIRED,
          },
        },
      },
    });
  }

  async bindProviderSubscription(
    params: BindProviderSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    try {
      await client.autoRenewalOperation.update({
        where: { id: params.operationId },
        data: {
          status: AutoRenewalOperationStatus.COMPLETED,
          providerSubscriptionId: params.providerSubscriptionId,
          subscription: {
            update: {
              providerSubscriptionId: params.providerSubscriptionId,
              autoRenewalStatus: AutoRenewalStatus.ENABLED,
            },
          },
        },
      });
    } catch (error) {
      // Из уникальных ключей эта запись изменяет только (provider, providerSubscriptionId).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Привязка завершает TRANSFER, у которого operationId равен paymentId.
        throw new SubscriptionBindingConflictError(
          params.operationId,
          params.providerSubscriptionId,
          'PROVIDER_SUBSCRIPTION_ALREADY_BOUND',
        );
      }
      throw error;
    }
  }

  async markExpired(subscriptionIds: string[], tx: PaymentsTransactionContext): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    await client.subscription.updateMany({
      where: { id: { in: subscriptionIds } },
      data: { status: SubscriptionStatus.EXPIRED },
    });
  }

  async createWithPaymentApplication(
    params: CreateSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    const transfer = params.autoRenewalTransfer;
    await client.subscription.create({
      data: {
        id: params.subscriptionId,
        userId: params.userId,
        planId: params.planId,
        startsAt: params.startsAt,
        expiresAt: params.expiresAt,
        status: params.status,
        provider: params.provider,
        providerSubscriptionId: params.providerSubscriptionId,
        autoRenewalStatus: params.autoRenewalStatus,
        paymentApplications: {
          create: {
            paymentId: params.paymentId,
            action: params.action,
            nextSubscriptionStartsAt: new Date(params.nextSubscriptionStartsAt),
            autoRenewalOperation: transfer
              ? {
                  create: {
                    id: params.paymentId,
                    userId: params.userId,
                    type: AutoRenewalOperationType.TRANSFER,
                    status: AutoRenewalOperationStatus.PENDING,
                    subscriptionId: params.subscriptionId,
                    provider: params.provider,
                    providerSubscriptionId: null,
                    sourceSubscriptionId: transfer.sourceSubscriptionId,
                    sourceProviderSubscriptionId: transfer.sourceProviderSubscriptionId,
                  },
                }
              : undefined,
          },
        },
      },
    });
  }

  async setAutoRenewalState(
    params: SetSubscriptionAutoRenewalRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    await client.subscription.update({
      where: { id: params.subscriptionId },
      data: { autoRenewalStatus: params.status },
    });
  }

  async renewWithPaymentApplication(
    params: RenewSubscriptionRepositoryParams,
    tx: PaymentsTransactionContext,
  ): Promise<void> {
    const client = tx as Prisma.TransactionClient;
    await client.subscription.update({
      where: { id: params.subscriptionId },
      data: {
        expiresAt: params.expiresAt,
        status: params.status,
        paymentApplications: {
          create: {
            paymentId: params.paymentId,
            action: 'RENEWED',
            nextSubscriptionStartsAt: new Date(params.nextSubscriptionStartsAt),
          },
        },
      },
    });
  }

  private toAutoRenewalOperation(
    operation: Prisma.AutoRenewalOperationGetPayload<{ select: typeof AUTO_RENEWAL_OPERATION_SELECT }>,
  ): AutoRenewalOperation {
    return {
      ...operation,
      type: AutoRenewalOperationType[operation.type],
      status: AutoRenewalOperationStatus[operation.status],
      provider: PaymentProviderFactory.create(operation.provider),
    };
  }
}
