# Предложения по контрактам D1 ↔ D2

Только для согласования с D1. Эти изменения сигнатур не применены; D2 работает с текущими контрактами.

## Предлагаемые изменения

- `markProviderSubscriptionCancellationScheduled`: заменить subscriptionId на paymentId.
  Тогда операция находится по PK, исчезают поиск по паре ID и проверка неоднозначности.
- `bindProviderSubscription`: убрать subscriptionId. Локальная подписка уже связана с операцией по paymentId.
- `findActiveSubscriptionForPurchase`: заменить на `hasActiveSubscription(userId): Promise<boolean>`.
  D1 нужна только информация о наличии подписки; ошибки чтения не превращать в false.
- `SuccessfulPayment`: убрать targetSubscriptionId. PURCHASE выбирает очередь по userId,
  RENEWAL — подписку по provider + providerSubscriptionId. Хранение снимка в Payment обсудить отдельно.

## Что должен обеспечить D1

- Вызывать `applySuccessfulPayment` только для подтверждённой оплаты. Передавать userId, planId
  и длительность из сохранённого Payment; paidAt — время оплаты в UTC ISO, periodCount — положительное
  целое, periodUnit — DAY/WEEK/MONTH. Для PURCHASE задавать boolean autoRenewalRequested.
- При повторе той же оплаты сохранять paymentId, пользователя, тариф, длительность, paidAt
  и намерение автопродления.
- Передавать непустой providerSubscriptionId для RENEWAL и первой покупки с автопродлением.
  В `bindProviderSubscription` передавать ID новой provider-подписки; при повторе — тот же ID.
- Подтверждать отключение только после ответа провайдера для старого ID из
  previousProviderSubscriptionId. Вызывать привязку после фиксации отключения и создания новой
  provider-подписки; оба вызова должны относиться к той же покупке.
- Передавать общий tx для записей D1 и D2 внутри каждого локального шага.
  При ошибке D2 откатывать весь шаг и не помечать webhook обработанным.
