import { DBOS } from '@dbos-inc/dbos-sdk';

export type PaymentWebhookRetryPolicy = {
  maxAttempts: number;
  initialDelaySeconds: number;
  backoffRate: number;
};

export type PaymentWebhookRetryAttempt = {
  error: unknown;
  attempt: number;
  delaySeconds: number;
};

export type PaymentWebhookRetryOptions = {
  operation: string;
  retry: PaymentWebhookRetryPolicy;
  shouldRetry: (error: unknown) => boolean;
  onRetry?: (attempt: PaymentWebhookRetryAttempt) => Promise<void>;
};

/**
 * Передаёт наверх исходную причину и сведения о последней попытке.
 * retriesExhausted=true только для повторяемой ошибки, исчерпавшей лимит.
 * Сам класс не определяет DEAD или RECONCILIATION_REQUIRED.
 */
export class PaymentWebhookRetryError extends Error {
  constructor(
    readonly operation: string,
    readonly attempt: number,
    readonly retriesExhausted: boolean,
    cause: unknown,
  ) {
    super('Payment webhook operation failed', { cause });
    this.name = 'PaymentWebhookRetryError';
  }
}

/**
 * Обёртка повторов: выполняет операцию и ждёт между попытками.
 * Правила повторяемости и callback аудита передаёт вызывающий код.
 * Здесь нет транзакций, работы со статусами webhook или правил классификации ошибок.
 */
export class DbosPaymentWebhookRetryService {
  async run<T>(action: (attempt: number) => Promise<T>, options: PaymentWebhookRetryOptions): Promise<T> {
    const { maxAttempts, initialDelaySeconds, backoffRate } = options.retry;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await action(attempt);
      } catch (error) {
        // Решение берём у переданного предиката; собственных правил по типам ошибок нет.
        const canRetry = options.shouldRetry(error);
        if (!canRetry || attempt === maxAttempts) {
          throw new PaymentWebhookRetryError(
            options.operation,
            attempt,
            canRetry && attempt === maxAttempts,
            error,
          );
        }
        const delaySeconds = initialDelaySeconds * backoffRate ** (attempt - 1);
        // Уведомляем вызывающий код до ожидания. Если callback падает, его ошибка
        // выходит наружу; допустимость игнорирования сбоя аудита определяет сам callback.
        await options.onRetry?.({ error, attempt, delaySeconds });
        // Транзакция операции уже завершена. DBOS сохраняет время пробуждения,
        // чтобы восстановить ожидание после перезапуска процесса.
        await DBOS.sleepSeconds(delaySeconds);
      }
    }
  }
}
