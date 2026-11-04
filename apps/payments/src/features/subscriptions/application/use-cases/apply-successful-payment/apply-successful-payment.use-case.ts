import { randomUUID } from 'node:crypto';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { PeriodUnit } from '../../../../../common/domain/period-unit.enum.js';
import type { PaymentsTransactionContext } from '../../../../payments/application/ports/payments-unit-of-work.js';
import type { ApplySuccessfulPaymentResult } from '../../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../../payments/application/types/successful-payment.types.js';
import { SubscriptionsRepository } from '../../ports/subscriptions.repository.js';
import { RecordBusinessAccessService } from '../../services/record-business-access.service.js';
import { PaymentType } from '../../../../payments/domain/payment.entity.js';
import { AutoRenewalStatus } from '../../../domain/enums/auto-renewal-status.enum.js';
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
  constructor(
    private readonly subscriptionsRepository: SubscriptionsRepository,
    private readonly recordBusinessAccess: RecordBusinessAccessService,
  ) {}

  async execute(command: ApplySuccessfulPaymentCommand) {
    const { payment, tx } = command;
    await this.subscriptionsRepository.lockByUserId(payment.userId, tx);

    const appliedPayment = await this.subscriptionsRepository.findPaymentApplication(payment.paymentId, tx);
    if (appliedPayment) {
      return appliedPayment.result;
    }

    const result = await this.applyPayment(payment, tx);
    // Событие фиксируется вместе с платежом; replay выше не создаёт нового сообщения.
    await this.recordBusinessAccess.execute(payment.userId, tx);
    return result;
  }

  private async applyPayment(payment: SuccessfulPayment, tx: PaymentsTransactionContext) {
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
      return this.applyRenewal(payment, subscriptions, tx);
    }

    if (!payment.autoRenewalRequested) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PURCHASE_AUTO_RENEWAL_REQUIRED');
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

    const paidAt = new Date(payment.paidAt);
    // Очередь определяется оплаченными датами на момент платежа, а не статусом при обработке.
    if (lastSubscription && lastSubscription.expiresAt > paidAt) {
      return this.enqueueSubscription(payment, lastSubscription, now, tx);
    }
    // Допущение до согласования с D1: у истёкшей последней подписки автопродление отключено.
    // Сценарий EXPIRED + ENABLED здесь не поддерживается; это не проверка состояния провайдера.
    return this.createInitialSubscription(payment, tx);
  }

  private async applyRenewal(
    payment: SuccessfulPayment,
    subscriptions: SubscriptionForPayment[],
    tx: PaymentsTransactionContext,
  ) {
    // Для автосписания подписку определяет provider-связь.
    if (!payment.providerSubscriptionId) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_SUBSCRIPTION_NOT_FOUND');
    }

    const subscription = subscriptions.find(
      (item) =>
        item.provider === payment.provider && item.providerSubscriptionId === payment.providerSubscriptionId,
    );

    if (!subscription) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_SUBSCRIPTION_NOT_FOUND');
    }

    if (subscription.planId !== payment.planId) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_PLAN_MISMATCH');
    }

    // Продлевать можно только последнюю подписку в оплаченной очереди.
    // Позднее списание за прежний тариф требует возврата в D1, а не изменения очереди в D2.
    if (subscriptions.some((item) => item.expiresAt > subscription.expiresAt)) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'RENEWAL_SUBSCRIPTION_NOT_LAST');
    }

    // Успешное продление восстанавливает ACTIVE. Настройку автопродления не меняем.
    const { expiresAt } = this.calculateSubscriptionPeriod(payment, subscription.expiresAt);

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
        status: SubscriptionStatus.ACTIVE,
        subscriptionId: result.subscriptionId,
      },
      tx,
    );

    return result;
  }

  private async createInitialSubscription(payment: SuccessfulPayment, tx: PaymentsTransactionContext) {
    const providerSubscriptionId = payment.providerSubscriptionId;

    if (!providerSubscriptionId) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PROVIDER_SUBSCRIPTION_MISSING');
    }

    // В этой ветке прошлые периоды уже закончились к моменту оплаты.
    const { startsAt, expiresAt } = this.calculateSubscriptionPeriod(payment, new Date(payment.paidAt));

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
        status: SubscriptionStatus.ACTIVE,
        provider: payment.provider,
        providerSubscriptionId,
        autoRenewalStatus: AutoRenewalStatus.ENABLED,
        subscriptionId: result.subscriptionId,
        action: 'CREATED',
        autoRenewalTransfer: null,
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
    // Для переноса автопродления D1 нужен ID старой provider-подписки.
    // RETIRED означает, что её автопродление уже окончательно отключено при прошлом переносе.
    if (
      !lastSubscription.providerSubscriptionId ||
      lastSubscription.autoRenewalStatus === AutoRenewalStatus.RETIRED
    ) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PREVIOUS_PROVIDER_SUBSCRIPTION_MISSING');
    }

    const sourceProviderSubscriptionId = lastSubscription.providerSubscriptionId;

    if (lastSubscription.provider !== payment.provider) {
      throw new SubscriptionPaymentConflictError(payment.paymentId, 'PROVIDER_MISMATCH');
    }

    // Новая подписка начинается после последнего оплаченного периода, включая PENDING в очереди.
    const { startsAt, expiresAt } = this.calculateSubscriptionPeriod(payment, lastSubscription.expiresAt);

    // SCHEDULED — сигнал D1 выполнить перенос автопродления, а не lifecycle-статус подписки.
    const result: ApplySuccessfulPaymentResult = {
      subscriptionId: randomUUID(),
      action: 'SCHEDULED',
      nextSubscriptionStartsAt: expiresAt.toISOString(),
      previousProviderSubscriptionId: sourceProviderSubscriptionId,
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
        // Пока обрабатывался платёж, запланированное начало могло наступить.
        status: startsAt > now ? SubscriptionStatus.PENDING : SubscriptionStatus.ACTIVE,
        provider: payment.provider,
        providerSubscriptionId: null,
        autoRenewalStatus: AutoRenewalStatus.ENABLING,
        subscriptionId: result.subscriptionId,
        action: 'SCHEDULED',
        autoRenewalTransfer: {
          operationId: randomUUID(),
          sourceSubscriptionId: lastSubscription.subscriptionId,
          sourceProviderSubscriptionId,
        },
      },
      tx,
    );
    return result;
  }

  /** D1 валидирует длительность; D2 вычисляет даты, ограничивая месяц его последним днём. */
  private calculateSubscriptionPeriod(payment: SuccessfulPayment, startsAt: Date) {
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
}
