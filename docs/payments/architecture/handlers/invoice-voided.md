# Invoice Voided: отмена unpaid renewal

[К маршрутизации Step 1](../steps/apply-payment-event.md) ·
[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/cancel-voided-invoice/cancel-voided-invoice.use-case.ts)

Диаграмма описывает текущий handler внутри переданного tx Step 1. Handler возвращает application result;
запись конечного webhook audit выполняет ApplyPaymentEventUseCase.finish.

```mermaid
flowchart TD
  I{"billingReason = subscription_cycle?"} -->|нет| B["REJECTED / IGNORED<br/>UNSUPPORTED_BILLING_REASON"]
  I -->|да| F["findByProviderInvoiceId<br/>только provider + Invoice ID"]
  F --> FOUND{"Payment найдена?"}
  FOUND -->|нет| R["RenewalPaymentContextUnavailableError<br/>INVOICE_PAYMENT_NOT_FOUND → bounded retry"]
  FOUND -->|да| P{"Provider совпадает?"}
  P -->|нет| PD["REJECTED / DEAD<br/>PROVIDER_MISMATCH"]
  P -->|да| E{"RENEWAL и checkoutPurpose=null?"}
  E -->|нет| N["REJECTED / IGNORED<br/>INELIGIBLE_PAYMENT"]
  E -->|да| V{"Invoice, Subscription,<br/>Customer references совместимы?"}
  V -->|нет| D["REJECTED / DEAD<br/>REFERENCE_CONFLICT"]
  V -->|да| ST{"Payment status"}
  ST -->|CANCELED| OK["COMPLETED / PAYMENT_CANCELED"]
  ST -->|не CREATED/PENDING| T["REJECTED / IGNORED<br/>PAYMENT_TERMINAL_STATE"]
  ST -->|CREATED/PENDING| U["cancelPendingPayment<br/>Invoice ID и Customer"]
  U -->|CANCELED| OK
  U -->|REFERENCE_CONFLICT| D
  U -->|INVALID_TRANSITION| T
```

Metadata paymentId не используется для выбора отменяемой Payment: он может указывать на source.
Отсутствующая renewal не создаётся этим handler; ожидается другой workflow, например finalized.
Уже успешная Payment не отменяется. Никаких изменений lifecycle локальной Subscription здесь нет.

COMPLETED → webhook PROCESSED; REJECTED → webhook IGNORED/DEAD по disposition.
Координатор завершает process, начисление доступа D2 не запускается.
Исключения не являются REJECTED: они откатывают tx и передаются в
[общую retry/error policy](../steps/retry-and-failure.md).
