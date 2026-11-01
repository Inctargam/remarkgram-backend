# Payments use cases

Этот раздел описывает самостоятельные application use cases Payments. Они не являются
шагами `DbosPaymentWebhookWorkflow`; схемы webhook-процесса находятся отдельно в
[`../steps`](../steps/).

| Use case                                      | Назначение                                                       |
| --------------------------------------------- | ---------------------------------------------------------------- |
| [CreateCheckoutUseCase](./create-checkout.md) | Идемпотентное создание Checkout и сохранение provider-корреляции |
