import type { Payment } from '../../../domain/payment.entity.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';
import { createSuccessfulPayment } from '../process-payment-webhook/successful-payment.factory.js';

/** Результат application-операции; не является статусом Payment или webhook audit. */
export enum PaymentEventOutcome {
  /** Обработка завершена без продолжения в D2. */
  COMPLETED = 'COMPLETED',
  /** Финансовый успех подтверждён; требуется применение оплаты в D2. */
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  /** Событие не применено; причина и способ завершения заданы отдельно. */
  REJECTED = 'REJECTED',
}

/** Выполненное действие при COMPLETED. Не доказывает финансовый успех. */
export enum PaymentEventCompletionCode {
  /**
   * Для subscription_cycle Invoice найдена или идемпотентно создана RENEWAL Payment.
   * Новая Payment ожидает оплаты в PENDING; существующая сохраняет свой статус.
   * Результат завершает webhook без применения доступа в D2 и не доказывает оплату.
   */
  RENEWAL_ENSURED = 'RENEWAL_ENSURED',
  /**
   * Событие завершения Checkout Session обработано, а его provider references сохранены.
   * Не является доказательством получения денег.
   */
  CHECKOUT_COMPLETED = 'CHECKOUT_COMPLETED',
  /** Истёкшая Checkout Session успешно завершила допустимый lifecycle незавершённого Payment. */
  CHECKOUT_EXPIRED = 'CHECKOUT_EXPIRED',
  /**
   * Неуспешная попытка оплаты зафиксирована для аудита без terminal-перехода Payment в FAILED.
   * Позднее успешное списание всё ещё допускается.
   */
  PAYMENT_FAILURE_RECORDED = 'PAYMENT_FAILURE_RECORDED',
  /** Provider подтвердил terminal cancellation, и соответствующий Payment безопасно отменён. */
  PAYMENT_CANCELED = 'PAYMENT_CANCELED',
}

/** Бизнес-причина неприменения события. */
export enum PaymentEventRejectionReason {
  /**
   * Локальный Payment, к которому относится provider event, не найден: internal paymentId
   * отсутствует в событии либо соответствующая запись отсутствует в локальном хранилище.
   */
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  /** В provider-событии отсутствует обязательная ссылка на Subscription. */
  SUBSCRIPTION_REFERENCE_MISSING = 'SUBSCRIPTION_REFERENCE_MISSING',
  /** В локальном Payment отсутствует subscriptionId, необходимый для renewal-операции. */
  SUBSCRIPTION_ID_MISSING = 'SUBSCRIPTION_ID_MISSING',
  /** Billing reason входящего invoice не поддерживается текущей бизнес-логикой. */
  UNSUPPORTED_BILLING_REASON = 'UNSUPPORTED_BILLING_REASON',
  /** Coordinator получил вид события, для которого не существует event-specific use case. */
  UNSUPPORTED_EVENT_KIND = 'UNSUPPORTED_EVENT_KIND',
  /** Payment уже находится в terminal-состоянии, несовместимом с операцией входящего события. */
  PAYMENT_TERMINAL_STATE = 'PAYMENT_TERMINAL_STATE',
  /** Найденный Payment по своим бизнес-характеристикам не подходит для запрошенной операции. */
  INELIGIBLE_PAYMENT = 'INELIGIBLE_PAYMENT',
  /** Сохранённый CheckoutPurpose противоречит бизнес-операции входящего события. */
  PURPOSE_MISMATCH = 'PURPOSE_MISMATCH',
  /** Provider входящего события не совпадает с provider локального Payment. */
  PROVIDER_MISMATCH = 'PROVIDER_MISMATCH',
  /** Сумма в provider-событии не совпадает с ожидаемой суммой Payment. */
  AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
  /** Валюта provider-события не совпадает с валютой Payment. */
  CURRENCY_MISMATCH = 'CURRENCY_MISMATCH',
  /** Provider Customer из события не совпадает с Customer, связанным с Payment. */
  CUSTOMER_MISMATCH = 'CUSTOMER_MISMATCH',
  /**
   * Provider reference уже связана с другим Payment либо обнаружена другая несовместимая
   * конкурирующая связь, нарушающая уникальность или идемпотентную корреляцию.
   */
  REFERENCE_CONFLICT = 'REFERENCE_CONFLICT',
}

/** Способ фиксации отклонённого события в webhook audit. */
export enum PaymentEventRejectionDisposition {
  IGNORED = 'IGNORED',
  DEAD = 'DEAD',
}

export type PaymentEventResult =
  | {
      outcome: PaymentEventOutcome.COMPLETED;
      code: PaymentEventCompletionCode;
      paymentId: string | null;
    }
  | {
      outcome: PaymentEventOutcome.PAYMENT_CONFIRMED;
      payment: SuccessfulPayment;
    }
  | {
      outcome: PaymentEventOutcome.REJECTED;
      disposition: PaymentEventRejectionDisposition;
      reason: PaymentEventRejectionReason;
    };

export const paymentEventResult = {
  /** Завершает обработку события без применения доступа в D2. */
  completed(code: PaymentEventCompletionCode, paymentId: string | null): PaymentEventResult {
    return { outcome: PaymentEventOutcome.COMPLETED, code, paymentId };
  },

  /** Передаёт снимок подтверждённой оплаты следующему шагу workflow. */
  paymentConfirmed(payment: Payment): PaymentEventResult {
    return {
      outcome: PaymentEventOutcome.PAYMENT_CONFIRMED,
      payment: createSuccessfulPayment(payment),
    };
  },

  /** Событие осознанно не применено без признания его противоречивым. */
  ignored(reason: PaymentEventRejectionReason): PaymentEventResult {
    return {
      outcome: PaymentEventOutcome.REJECTED,
      disposition: PaymentEventRejectionDisposition.IGNORED,
      reason,
    };
  },

  /** Событие нельзя безопасно применить из-за противоречия или нарушения инварианта. */
  dead(reason: PaymentEventRejectionReason): PaymentEventResult {
    return {
      outcome: PaymentEventOutcome.REJECTED,
      disposition: PaymentEventRejectionDisposition.DEAD,
      reason,
    };
  },
};
