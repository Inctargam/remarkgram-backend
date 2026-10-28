# PaymentIntent Canceled: terminal cancellation extension

[К маршрутизации Step 1](../steps/apply-payment-event.md) ·
[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/cancel-payment-intent/cancel-payment-intent.use-case.ts)

Диаграмма описывает текущий handler внутри переданного tx Step 1. Handler возвращает application result;
запись конечного webhook audit выполняет ApplyPaymentEventUseCase.finish.

```mermaid
flowchart TD
  I{"Есть metadata paymentId?"} -->|да| F["findById"]
  I -->|нет| FB["findByProviderPaymentId"]
  F --> FOUND{"Payment найдена?"}
  FB --> FOUND
  FOUND -->|нет| M["REJECTED / IGNORED<br/>PAYMENT_NOT_FOUND"]
  FOUND -->|да| PR{"Provider совпадает?"}
  PR -->|нет| PD["REJECTED / DEAD<br/>PROVIDER_MISMATCH"]
  PR -->|да| E{"PURCHASE + SUBSCRIPTION_EXTENSION?"}
  E -->|нет| NO["REJECTED / IGNORED<br/>INELIGIBLE_PAYMENT"]
  E -->|да| V{"PaymentIntent и Customer совместимы?"}
  V -->|нет| D["REJECTED / DEAD<br/>REFERENCE_CONFLICT"]
  V -->|да| ST{"Payment status"}
  ST -->|CANCELED| OK["COMPLETED / PAYMENT_CANCELED"]
  ST -->|не CREATED/PENDING| T["REJECTED / IGNORED<br/>PAYMENT_TERMINAL_STATE"]
  ST -->|CREATED/PENDING| U["cancelPendingPayment<br/>PaymentIntent ID и Customer"]
  U -->|CANCELED| OK
  U -->|REFERENCE_CONFLICT| D
  U -->|INVALID_TRANSITION| T
```

Initial purchase и renewal исключены через INELIGIBLE_PAYMENT. Сумма и валюта в этом handler
не проверяются: событие доказывает закрытие конкретного PaymentIntent. Несовместимый Customer
здесь даёт REFERENCE_CONFLICT, а не отдельный CUSTOMER_MISMATCH. Отмена не означает refund.

COMPLETED → webhook PROCESSED; REJECTED → webhook IGNORED/DEAD по disposition.
Координатор завершает process, начисление доступа D2 не запускается.
Исключения не являются REJECTED: они откатывают tx и передаются в
[общую retry/error policy](../steps/retry-and-failure.md).
