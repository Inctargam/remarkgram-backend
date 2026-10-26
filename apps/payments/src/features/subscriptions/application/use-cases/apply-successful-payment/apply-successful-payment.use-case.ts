import { randomUUID } from 'node:crypto';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PeriodUnit } from '../../../../../common/domain/period-unit.enum.js';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import type { ApplySuccessfulPaymentResult } from '../../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../../payments/application/types/successful-payment.types.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { PaymentType } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionStatus } from '../../../domain/enums/subscription-status.enum.js';
import { SubscriptionPaymentConflictError } from '../../errors/subscription-payment-conflict.error.js';
import type { SubscriptionForPayment } from '../../types/subscriptions.types.js';

export class ApplySuccessfulPaymentCommand extends Command<ApplySuccessfulPaymentResult> {
  constructor(
    public readonly payment: SuccessfulPayment,
    public readonly tx: PaymentsTransactionContext,
  ) {
    super();
  }
}

@CommandHandler(ApplySuccessfulPaymentCommand)
export class ApplySuccessfulPaymentUseCase implements ICommandHandler<ApplySuccessfulPaymentCommand> {
  constructor(private readonly subscriptionsRepository: SubscriptionsRepository) {}

  async execute(command: ApplySuccessfulPaymentCommand) {
    const { payment, tx } = command;
    await this.subscriptionsRepository.lockByUserId(payment.userId, tx);

    const appliedPayment = await this.subscriptionsRepository.findPaymentApplication(payment.paymentId, tx);
    if (appliedPayment) {
      return appliedPayment.result;
    }

    const subscriptions = await this.subscriptionsRepository.findByUserId(payment.userId, tx);
    if (
      subscriptions.some(
        (subscription) =>
          subscription.autoRenewalStatus === AutoRenewalStatus.ENABLING ||
          subscription.autoRenewalStatus === AutoRenewalStatus.DISABLING,
      )
    ) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'AUTO_RENEWAL_CHANGE_IN_PROGRESS');
    }

    const now = new Date();

    // Освобождаем ACTIVE, если фоновая задача ещё не обработала истёкший период.
    const expiredIds = subscriptions
      .filter(
        (subscription) => subscription.expiresAt <= now && subscription.status !== SubscriptionStatus.EXPIRED,
      )
      .map((subscription) => subscription.subscriptionId);

    if (expiredIds.length > 0) {
      await this.subscriptionsRepository.markExpired(expiredIds, tx);
    }

    if (payment.type === PaymentType.RENEWAL) {
      return this.applyRenewal(payment, subscriptions, now, tx);
    }

    const lastSubscription = subscriptions.reduce<SubscriptionForPayment | null>(
      (latest, subscription) =>
        !latest || subscription.expiresAt > latest.expiresAt ? subscription : latest,
      null,
    );

    // Переносим автопродление только с последней подписки; у остальных не должно оставаться списаний.
    if (
      subscriptions.some(
        (subscription) =>
          subscription.autoRenewalStatus === AutoRenewalStatus.ENABLED &&
          subscription.subscriptionId !== lastSubscription?.subscriptionId,
      )
    ) {
      throw new SubscriptionPaymentConflictError(
        payment.paymentId,
        'AUTO_RENEWAL_ENABLED_ON_NON_LAST_SUBSCRIPTION',
      );
    }

    // Если остался оплаченный период или включено старое автопродление, добавляем подписку в очередь.
    // Иначе создаём самостоятельную подписку от даты оплаты.
    if (lastSubscription && this.requiresSubscriptionContinuation(lastSubscription, now)) {
      return this.enqueueSubscription(payment, lastSubscription, now, tx);
    }
    return this.createInitialSubscription(payment, subscriptions, now, tx);
  }

  private async applyRenewal(
    payment: SuccessfulPayment,
    subscriptions: SubscriptionForPayment[],
    now: Date,
    tx: PaymentsTransactionContext,
  ) {
    // Для автосписания подписку определяет provider-связь.
    const subscription = payment.providerSubscriptionId
      ? subscriptions.find(
          (item) =>
            item.provider === payment.provider &&
            item.providerSubscriptionId === payment.providerSubscriptionId,
        )
      : undefined;

    if (!subscription) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_SUBSCRIPTION_NOT_FOUND');
    }

    if (subscription.planId !== payment.planId) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_PLAN_MISMATCH');
    }

    // Продлеваем оплаченный период, даже если webhook пришёл поздно. Настройку автопродления не меняем.
    const { expiresAt } = this.calculateSubscriptionPeriod(payment, subscription.expiresAt);

    this.assertNoOverlap(
      payment.paymentId,
      subscriptions.filter((item) => item.subscriptionId !== subscription.subscriptionId),
      subscription.startsAt,
      expiresAt,
    );

    const result: ApplySuccessfulPaymentResult = {
      subscriptionId: subscription.subscriptionId,
      action: 'RENEWED',
      nextSubscriptionStartsAt: expiresAt.toISOString(),
      previousProviderSubscriptionId: null,
    };

    await this.subscriptionsRepository.renewWithPaymentApplication(
      {
        paymentId: payment.paymentId,
        expiresAt,
        status: this.getStatus(subscription.startsAt, expiresAt, now),
        result,
      },
      tx,
    );

    return result;
  }

  private async createInitialSubscription(
    payment: SuccessfulPayment,
    subscriptions: SubscriptionForPayment[],
    now: Date,
    tx: PaymentsTransactionContext,
  ) {
    const providerSubscriptionId = payment.providerSubscriptionId ?? null;
    if (payment.autoRenewalRequested && !providerSubscriptionId) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PROVIDER_SUBSCRIPTION_MISSING');
    }

    const { startsAt, expiresAt } = this.calculateSubscriptionPeriod(payment, new Date(payment.paidAt));
    this.assertNoOverlap(payment.paymentId, subscriptions, startsAt, expiresAt);
    const result: ApplySuccessfulPaymentResult = {
      subscriptionId: randomUUID(),
      action: 'CREATED',
      nextSubscriptionStartsAt: expiresAt.toISOString(),
      previousProviderSubscriptionId: null,
    };

    await this.subscriptionsRepository.createWithPaymentApplication(
      {
        paymentId: payment.paymentId,
        userId: payment.userId,
        planId: payment.planId,
        startsAt,
        expiresAt,
        status: this.getStatus(startsAt, expiresAt, now),
        provider: payment.provider,
        providerSubscriptionId,
        autoRenewalStatus: payment.autoRenewalRequested
          ? AutoRenewalStatus.ENABLED
          : AutoRenewalStatus.DISABLED,
        result,
        autoRenewalOperation: null,
      },
      tx,
    );
    return result;
  }

  private async enqueueSubscription(
    payment: SuccessfulPayment,
    lastSubscription: SubscriptionForPayment,
    now: Date,
    tx: PaymentsTransactionContext,
  ) {
    if (
      !lastSubscription.providerSubscriptionId ||
      lastSubscription.autoRenewalStatus === AutoRenewalStatus.RETIRED
    ) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PREVIOUS_PROVIDER_SUBSCRIPTION_MISSING');
    }
    if (lastSubscription.provider !== payment.provider) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PROVIDER_MISMATCH');
    }
    // Текущая ветка SCHEDULED в D1 всегда создаёт новую recurring provider-подписку.
    if (!payment.autoRenewalRequested) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'SCHEDULED_AUTO_RENEWAL_REQUIRED');
    }

    const paidAt = new Date(payment.paidAt);
    const start = lastSubscription.expiresAt > paidAt ? lastSubscription.expiresAt : paidAt;
    // Начало после максимального expiresAt исключает пересечение с оплаченными периодами.
    const { startsAt, expiresAt } = this.calculateSubscriptionPeriod(payment, start);
    const result: ApplySuccessfulPaymentResult = {
      subscriptionId: randomUUID(),
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: expiresAt.toISOString(),
      previousProviderSubscriptionId: lastSubscription.providerSubscriptionId,
    };

    await this.subscriptionsRepository.setAutoRenewalState(
      {
        subscriptionId: lastSubscription.subscriptionId,
        status: AutoRenewalStatus.DISABLING,
      },
      tx,
    );

    await this.subscriptionsRepository.createWithPaymentApplication(
      {
        paymentId: payment.paymentId,
        userId: payment.userId,
        planId: payment.planId,
        startsAt,
        expiresAt,
        status: this.getStatus(startsAt, expiresAt, now),
        provider: payment.provider,
        providerSubscriptionId: null,
        autoRenewalStatus: AutoRenewalStatus.ENABLING,
        result,
        autoRenewalOperation: {
          id: payment.paymentId,
          userId: payment.userId,
          type: AutoRenewalOperationType.TRANSFER,
          status: AutoRenewalOperationStatus.PENDING,
          paymentId: payment.paymentId,
          subscriptionId: result.subscriptionId,
          provider: payment.provider,
          providerSubscriptionId: null,
          sourceSubscriptionId: lastSubscription.subscriptionId,
          sourceProviderSubscriptionId: lastSubscription.providerSubscriptionId,
        },
      },
      tx,
    );
    return result;
  }

  private requiresSubscriptionContinuation(subscription: SubscriptionForPayment, now: Date) {
    // Неистёкший период нужно учесть при постановке новой подписки в очередь.
    // ENABLED требует отключения старого автопродления даже при истёкшем доступе:
    // очередная оплата могла не пройти или её подтверждение ещё не обработано.
    return subscription.expiresAt > now || subscription.autoRenewalStatus === AutoRenewalStatus.ENABLED;
  }

  private assertNoOverlap(
    paymentId: string,
    subscriptions: SubscriptionForPayment[],
    startsAt: Date,
    expiresAt: Date,
  ) {
    if (
      subscriptions.some(
        (subscription) => subscription.startsAt < expiresAt && subscription.expiresAt > startsAt,
      )
    ) {
      throw new SubscriptionPaymentConflictError(paymentId, 'SUBSCRIPTION_PERIOD_OVERLAP');
    }
  }

  /** D1 валидирует длительность; D2 вычисляет даты, ограничивая месяц его последним днём. */
  private calculateSubscriptionPeriod(payment: SuccessfulPayment, startsAt: Date) {
    if (!Number.isFinite(startsAt.getTime())) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'INVALID_PERIOD');
    }

    const expiresAt = new Date(startsAt);
    switch (payment.periodUnit) {
      case PeriodUnit.DAY:
        expiresAt.setUTCDate(expiresAt.getUTCDate() + payment.periodCount);
        break;
      case PeriodUnit.WEEK:
        expiresAt.setUTCDate(expiresAt.getUTCDate() + payment.periodCount * 7);
        break;
      case PeriodUnit.MONTH: {
        const day = expiresAt.getUTCDate();
        expiresAt.setUTCDate(1);
        expiresAt.setUTCMonth(expiresAt.getUTCMonth() + payment.periodCount);
        const monthEnd = new Date(expiresAt);
        monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
        expiresAt.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
        break;
      }
    }

    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= startsAt) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'INVALID_PERIOD');
    }
    return { startsAt, expiresAt };
  }

  private getStatus(startsAt: Date, expiresAt: Date, now: Date) {
    if (expiresAt <= now) return SubscriptionStatus.EXPIRED;
    return startsAt > now ? SubscriptionStatus.PENDING : SubscriptionStatus.ACTIVE;
  }
}
