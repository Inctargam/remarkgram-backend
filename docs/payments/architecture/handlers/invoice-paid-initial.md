# Invoice Paid: первоначальная покупка

[К маршрутизации Step 1](../steps/apply-payment-event.md) ·
[К координатору](../c4/dynamic/payment-webhook.md) ·
[Код](../../../../apps/payments/src/features/payments/application/use-cases/payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.ts)

Диаграмма описывает текущий handler внутри переданного tx Step 1. Handler возвращает application result;
запись конечного webhook audit выполняет ApplyPaymentEventUseCase.finish.

```mermaid
flowchart TD
  I{"providerSubscriptionId есть?"} -->|нет| M["REJECTED / DEAD<br/>SUBSCRIPTION_REFERENCE_MISSING"]
  I -->|да| ID{"Есть metadata paymentId?"}
  ID -->|да| F["findById"]
  ID -->|нет| FB["findByProviderInvoiceId"]
  F --> FOUND{"Payment найдена?"}
  FB --> FOUND
  FOUND -->|нет| N["REJECTED / IGNORED<br/>PAYMENT_NOT_FOUND"]
  FOUND -->|да| V["Reconciliation: provider,<br/>PURCHASE + INITIAL_SUBSCRIPTION,<br/>amount, currency, Customer,<br/>PaymentIntent/Invoice/Subscription references"]
  V -->|конфликт| D["REJECTED / DEAD<br/>конкретная причина mismatch"]
  V -->|совместима| ST{"Payment status"}
  ST -->|SUCCEEDED| OK["PAYMENT_CONFIRMED<br/>сохранённый paidAt"]
  ST -->|не CREATED/PENDING| T["REJECTED / IGNORED<br/>PAYMENT_TERMINAL_STATE"]
  ST -->|CREATED/PENDING| U["confirmSuccessfulPayment<br/>paidAt и references текущего Invoice"]
  U -->|SUCCEEDED| OK
  U -->|REFERENCE_CONFLICT| C["REJECTED / DEAD<br/>REFERENCE_CONFLICT"]
  U -->|NOT_UPDATED| R["PaymentConfirmationNotAppliedError<br/>rollback и retry Step 1"]
```

Эта ветка не создаёт новую Payment: исходная PURCHASE создана Checkout-сценарием.
Если metadata ID передан, отсутствие записи по нему не запускает fallback по Invoice.
SUCCEEDED без paidAt нарушает инвариант и вызывает исключение фабрики результата.
Только успешный commit Step 1 позволяет координатору продолжить применение доступа.

PAYMENT_CONFIRMED оставляет webhook незавершённым: после commit координатор запускает Step 2.
COMPLETED → PROCESSED; REJECTED → IGNORED/DEAD по disposition, затем координатор завершает process.
Исключения не являются REJECTED: они откатывают tx и передаются в
[общую retry/error policy](../steps/retry-and-failure.md).
