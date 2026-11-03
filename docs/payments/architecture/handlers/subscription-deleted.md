# customer.subscription.deleted

[Код подготовки](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/prepare-canceled-subscription-renewal/prepare-canceled-subscription-renewal.use-case.ts) ·
[Код provider/finalize](../../../../apps/payments/src/features/payments/application/use-cases/process-payment-webhook/close-canceled-subscription-invoice.use-case.ts)

Stripe может перевести Subscription в `canceled` после исчерпания Smart Retries, оставив последний
Invoice в `open`. Поэтому `invoice.voided` не является гарантированным исходным terminal-сигналом.

```mermaid
flowchart TD
  E["customer.subscription.deleted"] --> F{"latest_invoice известен?"}
  F -->|да| EXACT["Точный поиск RENEWAL по providerInvoiceId"]
  F -->|нет| UNIQUE["Единственный PENDING RENEWAL по providerSubscriptionId"]
  UNIQUE -->|несколько| REC["RECONCILIATION_REQUIRED"]
  EXACT --> CHECK["Сверить provider references"]
  UNIQUE --> CHECK
  CHECK --> PREP["INVOICE_VOID_REQUIRED; Payment остаётся PENDING"]
  PREP --> VOID["DBOS provider step: Stripe Invoice void"]
  VOID -->|VOIDED| CANCEL["Новый tx: PENDING → CANCELED"]
  VOID -->|PAID| PAID{"Локальный Payment уже SUCCEEDED?"}
  PAID -->|да| DONE["Webhook PROCESSED без понижения Payment"]
  PAID -->|нет| RETRY["Bounded retry → reconciliation"]
```

Provider-вызов выполняется вне Prisma transaction. Идемпотентность Stripe-команды привязана к
Invoice: `invoice:void:<providerInvoiceId>`. Локальный Payment отменяется только после `VOIDED`.
Параллельный `invoice.voided`, который уже отменил Payment, принимается идемпотентно.

Cleanup разрешён только для `PaymentType.RENEWAL + checkoutPurpose=null`; initial `PURCHASE` не
отменяется. При `PAID` событие ждёт, пока `invoice.paid` переведёт Payment в `SUCCEEDED`.
