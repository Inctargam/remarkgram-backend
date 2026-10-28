# Checkout Session Expired: отмена неоплаченной попытки

[К маршрутизации Step 1](../steps/apply-payment-event.md) ·
[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.ts)

Диаграмма описывает текущий handler внутри переданного tx Step 1. Handler возвращает application result;
запись конечного webhook audit выполняет ApplyPaymentEventUseCase.finish.

```mermaid
flowchart TD
  I{"Есть metadata paymentId?"} -->|да| F["findById"]
  I -->|нет| FB["findByProviderCheckoutId"]
  F --> FOUND{"Payment найдена?"}
  FB --> FOUND
  FOUND -->|нет| M["REJECTED / IGNORED<br/>PAYMENT_NOT_FOUND"]
  FOUND -->|да| V["Проверить provider, optional amount/currency,<br/>Customer и Checkout reference"]
  V -->|конфликт| D["REJECTED / DEAD<br/>конкретный mismatch"]
  V -->|совместима| ST{"Payment status"}
  ST -->|CANCELED| OK["COMPLETED / CHECKOUT_EXPIRED"]
  ST -->|не CREATED/PENDING| T["REJECTED / IGNORED<br/>PAYMENT_TERMINAL_STATE"]
  ST -->|CREATED/PENDING| U["cancelPendingPayment<br/>Checkout ID и Customer"]
  U -->|CANCELED| OK
  U -->|REFERENCE_CONFLICT| C["REJECTED / DEAD<br/>REFERENCE_CONFLICT"]
  U -->|INVALID_TRANSITION| T
```

Handler не выводит Stripe mode из CheckoutPurpose. Успешную Payment поздний expired не понижает.
Invoice/Subscription/PaymentIntent references этого события не участвуют в reconciliation.
Повтор уже отменённой совместимой Payment завершается CHECKOUT_EXPIRED без записи.

COMPLETED → webhook PROCESSED; REJECTED → webhook IGNORED/DEAD по disposition.
Координатор завершает process, начисление доступа D2 не запускается.
Исключения не являются REJECTED: они откатывают tx и передаются в
[общую retry/error policy](../steps/retry-and-failure.md).
