import type { Payment } from '../../../domain/payment.entity.js';
import type { SuccessfulPayment } from '../../types/successful-payment.types.js';
import { createSuccessfulPayment } from '../process-payment-webhook/successful-payment.factory.js';

export enum PaymentEventResultStatus {
  /** Событие успешно применено; повторная обработка не требуется. */
  SUCCESS = 'SUCCESS',
  /** Событие осознанно не применено, но противоречия или повреждения данных нет. */
  IGNORED = 'IGNORED',
  /** Событие нельзя безопасно применить из-за противоречия или нарушения инварианта. */
  DEAD = 'DEAD',
}

/**
 * Бизнес-причина результата обработки provider event.
 *
 * Полная семантика определяется парой `PaymentEventResultStatus + PaymentEventResultCode`:
 * один только код не всегда определяет, было ли событие применено, проигнорировано или признано dead.
 */
export enum PaymentEventResultCode {
  /**
   * Событие завершения Checkout Session обработано, а его provider references сохранены.
   * Не является доказательством получения денег.
   */
  RENEWAL_ENSURED = 'RENEWAL_ENSURED',
  CHECKOUT_COMPLETED = 'CHECKOUT_COMPLETED',
  /** Истёкшая Checkout Session успешно завершила допустимый lifecycle незавершённого Payment. */
  CHECKOUT_EXPIRED = 'CHECKOUT_EXPIRED',
  /**
   * Provider подтвердил финансовый успех; Payment имеет статус SUCCEEDED и непустой paidAt.
   * Только этот код содержит SuccessfulPayment и запускает применение платежа к Subscription.
   */
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  /**
   * Неуспешная попытка оплаты зафиксирована для аудита без terminal-перехода Payment в FAILED.
   * Позднее успешное списание всё ещё допускается.
   */
  PAYMENT_FAILURE_RECORDED = 'PAYMENT_FAILURE_RECORDED',
  /** Provider подтвердил отмену PaymentIntent, и соответствующий Payment безопасно отменён. */
  PAYMENT_CANCELED = 'PAYMENT_CANCELED',
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

type CompletedPaymentEventResultCode =
  | PaymentEventResultCode.RENEWAL_ENSURED
  | PaymentEventResultCode.CHECKOUT_COMPLETED
  | PaymentEventResultCode.CHECKOUT_EXPIRED
  | PaymentEventResultCode.PAYMENT_FAILURE_RECORDED
  | PaymentEventResultCode.PAYMENT_CANCELED;

export type PaymentEventResult =
  | {
      status: PaymentEventResultStatus.SUCCESS;
      code: CompletedPaymentEventResultCode;
      paymentId: string | null;
      payment?: never;
    }
  | {
      status: PaymentEventResultStatus.SUCCESS;
      code: PaymentEventResultCode.PAYMENT_SUCCEEDED;
      paymentId: string;
      payment: SuccessfulPayment;
    }
  | {
      status: PaymentEventResultStatus.IGNORED | PaymentEventResultStatus.DEAD;
      code: PaymentEventResultCode;
    };

export const paymentEventResult = {
  /** Создаёт terminal-результат успешно применённого события, не требующего продолжения в D2. */
  success(code: CompletedPaymentEventResultCode, paymentId: string | null): PaymentEventResult {
    return { status: PaymentEventResultStatus.SUCCESS, code, paymentId };
  },

  /** Создаёт результат финансового успеха с durable DTO для следующего шага workflow. */
  successfulPayment(payment: Payment): PaymentEventResult {
    const successfulPayment = createSuccessfulPayment(payment);
    return {
      status: PaymentEventResultStatus.SUCCESS,
      code: PaymentEventResultCode.PAYMENT_SUCCEEDED,
      paymentId: payment.id,
      payment: successfulPayment,
    };
  },

  /** Создаёт результат осознанно неприменённого события, не требующего retry. */
  ignored(code: PaymentEventResultCode): PaymentEventResult {
    return { status: PaymentEventResultStatus.IGNORED, code };
  },

  /** Создаёт результат события, которое нельзя безопасно применить или повторить. */
  dead(code: PaymentEventResultCode): PaymentEventResult {
    return { status: PaymentEventResultStatus.DEAD, code };
  },
};
