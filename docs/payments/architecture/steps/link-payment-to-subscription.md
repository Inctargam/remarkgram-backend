# Шаг 2: применение доступа и linking

[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.ts)

Вход: `{ eventId, payment: SuccessfulPayment }` и новый tx. Внутренний процесс D2 не раскрывается;
D1 требует идемпотентного применения по paymentId в переданной общей транзакции.

```mermaid
flowchart TD
  I["SuccessfulPayment snapshot + eventId"] --> READ["Перечитать текущий Payment"]
  READ --> VALID{"Payment существует<br/>и status = SUCCEEDED?"}
  VALID -->|нет| ERR["Исключение / rollback всего Step 2"]
  VALID -->|да| D2["D2.applySuccessfulPayment<br/>providerSubscriptionId из текущего Payment + tx"]
  D2 --> CHECK["Проверить UUID, canonical ISO date,<br/>совместимость action с PaymentType,<br/>старый provider ID для SCHEDULED"]
  CHECK -->|некорректно| ERR
  CHECK --> LINK["Условно связать Payment.subscriptionId"]
  LINK --> LR{"outcome = LINKED?"}
  LR -->|нет| ERR
  LR -->|да| ATT["attachPayment к webhook"]
  ATT --> ACT{"D2 action = SCHEDULED?"}
  ACT -->|нет: CREATED / RENEWED| FIN["markProcessed<br/>результат FINISHED"]
  ACT -->|да| SCH["Не завершать webhook<br/>результат SCHEDULED + transition params"]
  FIN --> COM["Commit общей транзакции D1/D2"]
  SCH --> COM
  COM --> CO{"Координатор: outcome"}
  CO -->|FINISHED| END["return void"]
  CO -->|SCHEDULED| NEXT["Step 3: отключить старое автопродление"]
```

D2 возвращает `subscriptionId`, `action`, `nextSubscriptionStartsAt`, `previousProviderSubscriptionId`.
D1 преобразует этот ответ в собственный `LinkPaymentToSubscriptionResult`:

| Результат | Содержимое | Решение координатора |
| --- | --- | --- |
| FINISHED | Только outcome | Вернуть управление; доступ и webhook уже зафиксированы |
| SCHEDULED | eventId, payment snapshot, subscriptionId, nextSubscriptionStartsAt, previousProviderSubscriptionId | Запустить оба provider-шага |

Для SCHEDULED `nextSubscriptionStartsAt` — конец всей уже оплаченной цепочки, включая новую покупку:
это время первого будущего provider billing, не начало добавленного локального периода.
Конфликт Payment linking откатывает и начисление D2 в этом шаге; финансовый commit Step 1 сохраняется.
Адаптация D2 к действующим портам — отдельная работа другого разработчика.
