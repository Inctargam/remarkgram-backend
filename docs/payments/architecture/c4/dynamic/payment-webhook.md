# Динамика C4: шаги и решения координатора

[Навигация](../../README.md) · [Компоненты](../component/payment-webhook.md)

```mermaid
flowchart TD
  E["enqueue: нормализованный PaymentEvent"] --> Q["DBOS startWorkflow / return-existing<br/>ID = payment-webhook:provider:providerEventId"]
  Q --> ACK["Вызывающей стороне: RECEIVED<br/>задача сохранена, деньги ещё не подтверждены"]
  Q --> W["processPaymentWebhook<br/>получить DBOS.workflowID"]
  W --> P["0. persistPaymentWebhook<br/>локальная durable-транзакция"]
  P --> ID["Результат: eventId"]
  ID --> A["1. applyPaymentWebhook<br/>локальная транзакция с retry"]
  A -->|NOT_UPDATED: exception / rollback| RETRY["Bounded retry Step 1<br/>sleep, затем новое чтение и reconciliation"]
  RETRY -->|есть попытки| A
  RETRY -->|лимит| REC["RECONCILIATION_REQUIRED"]
  A --> M["Прочитать результат: текущий outcome<br/>либо преобразовать legacy DBOS status/code"]
  M --> R{"outcome = PAYMENT_CONFIRMED?"}
  R -->|нет| END["return void<br/>статус webhook уже записан Step 1"]
  R -->|да: SuccessfulPayment| L["2. linkPaymentToSubscription<br/>локальная транзакция с retry"]
  L --> S{"outcome = SCHEDULED?"}
  S -->|нет: FINISHED| DONE["return void<br/>webhook PROCESSED"]
  S -->|да: transition params| C["3a. scheduleProviderSubscriptionCancellationStep<br/>внешний DBOS step, без DB-транзакции"]
  C --> CR["Результат: подтверждённые исходные params"]
  CR --> CL["3b. recordProviderSubscriptionCancellationScheduled<br/>локальная транзакция с retry, результат void"]
  CL --> N["4a. createDeferredProviderSubscriptionStep<br/>внешний DBOS step, без DB-транзакции"]
  N --> NR["Результат: providerSubscriptionId"]
  NR --> B["4b. recordDeferredProviderSubscription<br/>локальная транзакция с retry"]
  B --> DONE
```

| Операция | Что получает координатор | Как принимает решение | Детали |
| --- | --- | --- | --- |
| 0 | `eventId: string` | Перейти к финансовому шагу | [Сохранение](../../steps/persist-payment-webhook.md) |
| 1 | `PaymentEventResult` | Только `outcome=PAYMENT_CONFIRMED` продолжает в D2; остальные результаты завершают process | [Финансовый шаг](../../steps/apply-payment-event.md) |
| 2 | `FINISHED` или `SCHEDULED` с параметрами перехода | FINISHED → return; SCHEDULED → старый provider cancel и новый provider create | [Linking](../../steps/link-payment-to-subscription.md) |
| 3a | Исходные transition params после проверки ответа Stripe | Передать в 3b и затем 4a; новой бизнес-развилки нет | [Замена provider Subscription](../../steps/replace-provider-subscription.md) |
| 3b | `void` после commit | Можно создавать новую provider Subscription | [Замена provider Subscription](../../steps/replace-provider-subscription.md) |
| 4a | `{ providerSubscriptionId }` | Передать ID вместе с params в локальную фиксацию | [Замена provider Subscription](../../steps/replace-provider-subscription.md) |
| 4b | `void` после commit | Завершить process; webhook уже PROCESSED | [Замена provider Subscription](../../steps/replace-provider-subscription.md) |

Исключение не является бизнес-результатом из таблицы. Оно прерывает последовательность и попадает
в соответствующую [политику retry/failure](../../steps/retry-and-failure.md).
Успешный финансовый commit Step 1 не откатывается из-за последующего сбоя Step 2–4.
