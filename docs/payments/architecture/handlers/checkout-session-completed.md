# Checkout Session Completed: enrichment

[К маршрутизации Step 1](../steps/apply-payment-event.md) ·
[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.ts)

Диаграмма описывает текущий handler внутри переданного tx Step 1. Handler возвращает application result;
запись конечного webhook audit выполняет ApplyPaymentEventUseCase.finish.

```mermaid
flowchart TD
  I["event.paymentId присутствует?"] -->|нет| M["REJECTED / IGNORED<br/>PAYMENT_NOT_FOUND"]
  I -->|да| F["findById"]
  F -->|нет записи| M
  F -->|найдена| V["Проверить provider,<br/>amount/currency если переданы,<br/>совместимость Customer и Checkout ID"]
  V --> MODE{"Фактический Session mode"}
  MODE -->|subscription| S["Проверить provider Subscription reference"]
  MODE -->|иначе: payment-путь| P["Проверить PaymentIntent reference"]
  V -->|конфликт| D["REJECTED / DEAD<br/>конкретная причина mismatch"]
  S -->|конфликт| D
  P -->|конфликт| D
  S --> A{"Все входящие ссылки уже сохранены?"}
  P --> A
  A -->|да| OK["COMPLETED / CHECKOUT_COMPLETED"]
  A -->|нет| U["applyCheckoutCompleted<br/>записать совместимые непустые references"]
  U -->|APPLIED| OK
  U -->|REFERENCE_CONFLICT| C["REJECTED / DEAD<br/>REFERENCE_CONFLICT"]
```

Session mode определяет состав command, а не CheckoutPurpose. Для subscription передаются
Checkout/Customer/Subscription, для payment — Checkout/Customer/PaymentIntent. Invoice ID не участвует.
Наличие ссылки проверяется как знание: входящий null не очищает сохранённое значение.
Финансовый статус не меняется; completed Session не доказывает оплату.
Конфликты: PROVIDER_MISMATCH, AMOUNT_MISMATCH, CURRENCY_MISMATCH, CUSTOMER_MISMATCH, REFERENCE_CONFLICT.

COMPLETED → webhook PROCESSED; REJECTED → webhook IGNORED/DEAD по disposition.
Координатор завершает process, начисление доступа D2 не запускается.
Исключения не являются REJECTED: они откатывают tx и передаются в
[общую retry/error policy](../steps/retry-and-failure.md).
