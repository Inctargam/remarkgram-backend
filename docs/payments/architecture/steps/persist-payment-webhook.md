# Шаг 0: сохранить webhook

[К координатору](../c4/dynamic/payment-webhook.md)

Вход: нормализованный `PaymentEvent` и `workflowId`. Метод `persistPaymentEventStep`
вызывает `saveIfAbsent` в datasource-транзакции `persistPaymentWebhook`.

```mermaid
flowchart TD
  I["PaymentEvent + workflowId"] --> T["Открыть локальную durable-транзакцию"]
  T --> S["PaymentEventRepository.saveIfAbsent<br/>дедупликация по provider + providerEventId"]
  S --> C["Commit"]
  C --> R["Вернуть persisted.id как eventId"]
  R --> NEXT["Координатор запускает Step 1"]
  S -->|исключение / rollback| RETRY["Bounded retry: до 10 попыток<br/>durable sleep 10, 20, 40... секунд"]
  RETRY -->|допустим повтор| T
  RETRY -->|неповторяемая ошибка или лимит| FAIL["Исходная cause выходит в DBOS<br/>локальный конечный статус не фиксируется"]
```

Результат — идентификатор inbox-записи, а не Payment и не признак оплаты.
Операция выполняется до основного try/catch process: при ошибке нет подтверждённого eventId,
по которому координатор мог бы безопасно записать DEAD или RECONCILIATION_REQUIRED.
Отсутствующий DBOS.workflowID вызывает исключение ещё до этого шага.
