# Шаги 3–4: замена provider Subscription

[К координатору](../c4/dynamic/payment-webhook.md)

Выполняются только после SCHEDULED. Общие params: `eventId`, `payment`, `subscriptionId`,
`nextSubscriptionStartsAt`, `previousProviderSubscriptionId`.

```mermaid
sequenceDiagram
  participant W as Координатор
  participant C as Cancellation use case
  participant P as PaymentProviderPort / Stripe
  participant D as D2 port
  participant R as PaymentsRepository
  participant E as PaymentEventRepository
  W->>C: 3a scheduleAtProvider(params), DBOS step
  C->>P: scheduleSubscriptionCancellation(old provider ID)
  P-->>C: providerSubscriptionId + cancelAtPeriodEnd
  C->>C: Проверить ID и cancelAtPeriodEnd=true
  C-->>W: Исходные params после подтверждения
  W->>C: 3b recordScheduled(params, tx)
  C->>D: confirmAutoRenewalCancellation(paymentId, old ID, tx)
  D-->>C: void
  C-->>W: void после commit
  W->>P: 4a через createAtProvider: createDeferredSubscription
  Note over W,P: Без локальной DB-транзакции; DBOS step
  P-->>W: providerSubscriptionId после проверки непустого ID
  W->>R: 4b bindPaymentProviderSubscription(params, tx)
  R-->>W: BOUND или NOT_BOUND
  Note over W,R: Ниже — только при BOUND; иначе exception и rollback
  W->>D: bindProviderSubscription(paymentId, new ID, tx)
  D-->>W: void
  W->>E: markProcessed(eventId, tx)
  Note over W,E: Commit одной локальной транзакции
  W->>W: return void
```

Стрелки Step 4 сокращены: provider-вызов, persistence и D2-вызов выполняет
CreateDeferredProviderSubscriptionUseCase; координатор вызывает его createAtProvider / recordCreated.

## Шаг 3: отключить прежнее автопродление

[Код](../../../../apps/payments/src/features/payments/application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.ts)

3a вызывает Stripe с `cancel_at_period_end=true`; это не немедленная отмена оплаченного доступа.
Ответ должен подтвердить прежний provider ID и требуемую настройку. Несовпадение выбрасывает
PaymentProviderResultMismatchError. Успех возвращает исходные params, а не Stripe object.

Координатор передаёт их в 3b: новый локальный tx и D2.confirmAutoRenewalCancellation.
Ожидаемый эффект D2 — RETIRED старой связи и BINDING_PENDING операции.
Результат void означает успешное завершение локального вызова; после commit координатор продолжает Step 4.

## Шаг 4: создать и привязать новую provider Subscription

[Код](../../../../apps/payments/src/features/payments/application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.ts)

4a требует providerCustomerId и передаёт провайдеру customer, стоимость, валюту, период из snapshot,
локальные paymentId/subscriptionId, `billingCycleAnchor=nextSubscriptionStartsAt`, `operationId=paymentId`.
Stripe adapter создаёт идемпотентные Product и Subscription. D1 не пересчитывает дату D2.
Возвращается только `{ providerSubscriptionId }`; пустой ID — ошибка.

4b получает params и этот ID. В общей транзакции:

1. Условно связывает Payment с новым provider ID; NOT_BOUND вызывает конфликт и rollback.
2. Вызывает D2.bindProviderSubscription(paymentId, new ID, tx).
3. Помечает webhook PROCESSED.

Результат void после commit завершает process. Ошибка любого пункта откатывает всю локальную запись.
Повтор локальной транзакции использует уже сохранённый DBOS результат внешнего шага:
из-за сбоя binding координатор не создаёт новую provider Subscription заново.
Внешняя идемпотентность также нужна для сбоя между provider success и сохранением результата DBOS.
