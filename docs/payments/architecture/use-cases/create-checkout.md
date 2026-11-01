# CreateCheckoutUseCase

[Код](../../../../apps/payments/src/features/payments/application/use-cases/create-checkout.use-case.ts)

Это самостоятельный application use case, запускаемый клиентским запросом. Он не входит
в `DbosPaymentWebhookWorkflow`: webhook workflow позднее обрабатывает события уже созданного
Checkout.

Вход: `userId`, `planId`, `idempotencyKey`, `provider`, `autoRenewal`.

Выход: `paymentId`, `checkoutUrl`, `status`.

## 1. Маршрутизация запроса

`execute` определяет provider и делегирует разрешение Payment. Ранний результат возвращается
без обращения к provider. Только чистый `CREATED` Payment переходит к созданию Checkout.

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant U as CreateCheckoutUseCase
  participant F as PaymentProviderFactory
  participant R as PaymentsRepository

  Client->>U: execute(input)
  U->>F: create(input.provider)
  F-->>U: providerType
  U->>R: findByUserAndIdempotency(userId, idempotencyKey)
  alt Ошибка чтения
    R--xU: persistence error
    U--xClient: PaymentPersistenceError
  else Payment найден
    R-->>U: Payment
    U->>U: разрешить существующий Payment
  else Payment не найден
    R-->>U: null
    U->>U: зарезервировать новый Payment
  end
  alt Получен готовый результат
    U-->>Client: paymentId, checkoutUrl, status
  else Получен чистый CREATED Payment
    U->>U: создать и прикрепить Checkout
    U-->>Client: paymentId, checkoutUrl, PENDING
  end
```

## 2. Повторный запрос: существующий Payment

Одинаковый `Idempotency-Key` может продолжать только исходное намерение пользователя.
Fingerprint проверяется до любого раннего возврата. Сохранённые `checkoutPurpose` и контекст
подписки повторно не вычисляются.

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant U as CreateCheckoutUseCase
  participant P as Existing Payment

  U->>U: assertSameFingerprint(P, input, providerType)
  alt planId, providerType или autoRenewal отличаются
    U--xClient: PaymentIdempotencyConflictError
  else status = CREATED
    U->>U: CONTINUE(P)
  else status = PENDING
    U->>U: mapStoredResult(P)
    alt Provider-корреляция и checkoutUrl полные
      U-->>Client: paymentId, checkoutUrl, PENDING
    else Сохранённое состояние неполное
      U--xClient: PaymentInconsistentStateError
    end
  else status = SUCCEEDED, FAILED или CANCELED
    U-->>Client: paymentId, null, status
  else Неизвестное состояние
    U--xClient: PaymentInconsistentStateError
  end
```

Новый Checkout для `SUCCEEDED`, `FAILED` или `CANCELED` Payment не создаётся: повторное
использование той же записи сделало бы snapshot и время оплаты противоречивыми.

## 3. Первый запрос: резервирование нового Payment

`SubscriptionContextPort` возвращает только boolean. Payments самостоятельно фиксирует
назначение Checkout и не получает от Subscriptions локальный `subscriptionId`.

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant U as CreateCheckoutUseCase
  participant Plans as PlansRepository
  participant S as SubscriptionContextPort
  participant P as Payment entity
  participant R as PaymentsRepository

  U->>Plans: getByIdOrThrow(planId)
  alt План недоступен
    Plans--xU: error
    U--xClient: PaymentPlanUnavailableError
  else План найден
    Plans-->>U: plan snapshot
    U->>S: hasActiveSubscription(userId)
    alt Контекст подписки недоступен
      S--xU: error
      U--xClient: PaymentSubscriptionContextError
    else Контекст получен
      S-->>U: hasActiveSubscription
      alt Активная подписка существует
        U->>P: create(purpose=SUBSCRIPTION_EXTENSION)
      else Активной подписки нет
        U->>P: create(purpose=INITIAL_SUBSCRIPTION)
      end
      U->>R: create(candidate)
      alt Ошибка записи
        R--xU: persistence error
        U--xClient: PaymentPersistenceError
      else Конфликт начального резервирования
        R-->>U: INITIAL_RESERVATION_CONFLICT
        U--xClient: PaymentInitialReservationConflictError
      else Payment зарезервирован или найден конкурентный результат
        R-->>U: created.payment
        U->>U: assertSameFingerprint + mapExistingPayment
        alt Конкурент уже прикрепил Checkout
          U-->>Client: сохранённый результат
        else Payment остался CREATED
          U->>U: CONTINUE(payment)
        end
      end
    end
  end
```

## 4. Создание и прикрепление Checkout

Внешняя операция разрешена только для чистого `CREATED` Payment без частично сохранённой
provider-корреляции. Частичное состояние требует reconciliation, а не повторного создания
финансовой операции.

```mermaid
sequenceDiagram
  autonumber
  actor Client
  participant U as CreateCheckoutUseCase
  participant C as PaymentCustomerService
  participant Provider as PaymentProviderPort
  participant R as PaymentsRepository

  U->>U: assertCanCreateCheckoutForPayment(payment)
  alt Payment не чистый CREATED
    U--xClient: PaymentInconsistentStateError
  else Payment пригоден для Checkout
    U->>C: getOrCreate(userId, providerType)
    C-->>U: providerCustomer
    U->>Provider: createCheckout(payment snapshot, operationId=payment.id)
    alt Известная PaymentsError
      Provider--xU: PaymentsError
      U--xClient: исходная PaymentsError
    else Неизвестный результат provider
      Provider--xU: unexpected error
      U->>U: log payment_provider_contract_violation
      U--xClient: PaymentProviderOutcomeUnknownError
    else Checkout создан
      Provider-->>U: checkout
      U->>R: attachCheckout(payment.id, checkout + snapshot)
      alt Ошибка сохранения
        R--xU: persistence error
        U--xClient: PaymentPersistenceError
      else ATTACHED или ALREADY_ATTACHED
        R-->>U: PENDING Payment
        U->>U: mapStoredResult(payment)
        U-->>Client: paymentId, checkoutUrl, PENDING
      else Результат нельзя безопасно прикрепить
        R-->>U: reconciliation outcome
        U--xClient: PaymentCheckoutReconciliationRequiredError
      end
    end
  end
```

## Инварианты

- `idempotencyKey` адресует одно исходное намерение пользователя.
- Fingerprint состоит из `planId`, `providerType` и `autoRenewal`.
- `checkoutPurpose` вычисляется только при создании Payment и не пересчитывается при replay.
- Provider Checkout создаётся только для чистого `CREATED` Payment.
- `operationId = payment.id` связывает идемпотентность внешней операции с локальным Payment.
- Успешный ответ возвращается только из проверенного сохранённого состояния `PENDING`.
- Неопределённый provider outcome и частичная корреляция требуют reconciliation.
