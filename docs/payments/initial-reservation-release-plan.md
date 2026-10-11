# План освобождения initial reservation

## 1. Цель и выбранный подход

Документ описывает практический порядок реализации освобождения initial reservation для текущего
Stripe Checkout flow.

На данном этапе не вводятся:

- отдельная таблица reservation;
- `ACTIVE / RELEASED / CONSUMED` state machine;
- универсальный orchestration framework;
- lease и generic reconciliation platform.

Reservation остаётся производной от `Payment.status`, `checkoutPurpose` и `subscriptionId` и
защищается существующим partial unique index:

```text
checkoutPurpose = INITIAL_SUBSCRIPTION
AND (
  status IN (CREATED, PENDING)
  OR (status = SUCCEEDED AND subscriptionId IS NULL)
)
```

Основной принцип:

```text
известная terminal Stripe Session
→ изменить Payment на terminal status
→ reservation освободится через существующий индекс

неизвестный результат создания Session
→ reservation не освобождать автоматически
→ recovery/manual review
```

## 2. Решения до начала разработки

Перед первым PR нужно явно подтвердить четыре продуктовых решения.

### 2.1. Время жизни Checkout Session

Предлагаемое значение:

```text
30 минут
```

Stripe допускает `expires_at` от 30 минут до 24 часов после создания Session. Значение должно быть
конфигурируемым, но backend обязан валидировать поддерживаемый диапазон.

### 2.2. Поведение при выборе другого плана

Рекомендуемый UX:

1. API сообщает, что уже существует активный initial checkout.
2. UI предлагает закрыть старый Checkout и продолжить с новым планом.
3. Backend сначала expire-ит старую Stripe Session.
4. Только после подтверждённого `expired` создаётся новый initial Payment с новым
   `Idempotency-Key`.

Нельзя локально освободить reservation, оставив старую Stripe Session открытой.

### 2.3. Значение `PaymentStatus.FAILED`

Нужно выбрать одно из двух определений:

1. `FAILED` означает любую окончательно завершённую payment attempt, включая доказанный отказ
   создать Checkout Session.
2. `FAILED` означает только подтверждённый финансовый отказ после создания Session.

Для минимальной реализации рекомендуется вариант 1. Тогда доказанный
`REJECTED_NOT_CREATED` может выполнить `CREATED → FAILED` и освободить reservation без отдельной
state machine.

Если финансовая аналитика требует вариант 2, до реализации recovery понадобится отдельный
checkout closure status. Это отдельное архитектурное решение, а не часть первого PR.

### 2.4. Допустимость manual recovery

Для первой версии предлагается:

- автоматизировать все операции с известным `providerCheckoutId`;
- редкие `CREATED/UNKNOWN` без Session ID оставлять заблокированными;
- разрешать их только через документированный manual review;
- не предоставлять публичный force-release endpoint.

Если такой режим неприемлем по SLA или объёму операций, потребуется более сложный recovery design до
запуска production.

## 3. Целевая минимальная система

```text
CreateCheckoutUseCase
        │
        ├── PaymentsRepository + partial unique index
        ├── PaymentCustomerService
        └── StripePaymentProvider
                │
                └── Checkout Session expires_at = now + configured TTL

Stripe webhook
        │
        └── checkout.session.expired
                → PENDING → CANCELED
                → reservation освобождён

CancelCheckoutUseCase
        │
        └── Stripe expire known Session
                → confirmed expired
                → PENDING → CANCELED

CheckoutReconciliationJob
        │
        └── retrieve known Session by providerCheckoutId
                → применить фактический terminal status
```

Отдельно существует узкая recovery-ветка для `CREATED`, где Stripe Session могла быть создана, но
её ID не сохранён локально.

## 4. Порядок реализации

### Этап 0. Зафиксировать решения

До изменения кода:

1. Утвердить TTL: 30 минут.
2. Утвердить UX смены плана: явная отмена старого Checkout.
3. Утвердить семантику `PaymentStatus.FAILED`.
4. Утвердить допустимость manual review для `CREATED/UNKNOWN`.
5. Подтвердить, что пока поддерживается только `card`, без дополнительных delayed payment methods.

Результат этапа — короткая запись решения в этом документе или ADR. Без этих ответов можно
реализовать TTL/webhook, но нельзя безопасно завершить provider error recovery.

### Этап 1. Настроить 30-минутную Stripe Session

Это первый кодовый PR.

Изменения:

1. Добавить конфигурацию, например:

   ```text
   STRIPE_CHECKOUT_TTL_MINUTES=30
   ```

2. Валидировать диапазон `30 минут .. 24 часа`.
3. Передавать `expires_at` в:
   - subscription Checkout;
   - one-time extension Checkout.
4. Продолжать сохранять фактический `session.expires_at` в `Payment.checkoutExpiresAt`.
5. Не вычислять локальный expiry как источник истины после ответа Stripe: сохранять значение из
   созданной Session.

Тесты:

- Stripe adapter передаёт корректный Unix timestamp;
- одинаковый TTL применяется для обоих Checkout modes;
- невалидная конфигурация не позволяет запустить сервис;
- returned `checkoutExpiresAt` берётся из Stripe response.

Критерий готовности:

```text
новая Checkout Session создаётся с expires_at ≈ now + 30 минут,
а Payment содержит фактический Stripe expiry
```

### Этап 2. Доказать освобождение через webhook

Текущий код уже нормализует:

```text
checkout.session.expired → CANCELED
```

и умеет выполнить `PENDING → CANCELED`. На этом этапе нужно не перепроектировать обработчик, а
закрыть поведение интеграционными тестами.

Добавить PostgreSQL integration test:

1. Создать initial `Payment=PENDING` с известным `providerCheckoutId`.
2. Убедиться, что второй initial Payment с новым key получает reservation conflict.
3. Обработать валидный `checkout.session.expired`.
4. Проверить `Payment.status=CANCELED`.
5. Создать новый initial Payment с новым key.
6. Проверить, что partial unique index теперь разрешает insert.

Также проверить:

- duplicate webhook — no-op;
- webhook с другим checkout/customer/payment ID не освобождает reservation;
- `SUCCEEDED` без `subscriptionId` продолжает удерживать reservation;
- `FAILED/CANCELED` не удерживают reservation.

Критерий готовности:

```text
подтверждённый Stripe expiry автоматически и идемпотентно разрешает новую initial purchase
```

### Этап 3. Добавить явную отмену активного Checkout

Это второй продуктовый use case, не часть `CreateCheckout`.

Предлагаемый контракт:

```text
CancelCheckout(userId, paymentId)
```

Последовательность:

1. Найти Payment и проверить владельца.
2. Разрешить операцию только для:

   ```text
   checkoutPurpose = INITIAL_SUBSCRIPTION
   status = PENDING
   providerCheckoutId != null
   ```

3. Вызвать Stripe `expire Checkout Session`.
4. Проверить возвращённые Session ID, Customer ID, metadata payment ID и status.
5. Выполнить conditional update:

   ```text
   PENDING → CANCELED
   WHERE id = paymentId
     AND providerCheckoutId = expectedCheckoutId
   ```

6. Повторная отмена `CANCELED` возвращает idempotent success.
7. Если Stripe сообщает `complete`, локально не отменять Payment: передать состояние в обычную
   обработку success/reconciliation.
8. Если outcome неизвестен, оставить reservation и вернуть retryable/reconciliation error.

После успешной отмены frontend создаёт Checkout для нового плана с новым `Idempotency-Key`.

Не следует автоматически отменять активный Checkout только потому, что поступил запрос с другим
`planId`: это неожиданная финансовая операция. Смена плана должна быть явным пользовательским
действием.

Тесты:

- open Session успешно expire-ится и освобождает reservation;
- повтор Cancel — idempotent;
- complete/paid Session не переводится в `CANCELED`;
- timeout Stripe не освобождает reservation;
- чужой Payment запрещён;
- late `checkout.session.expired` после синхронной отмены — no-op.

### Этап 4. Добавить reconciliation для `PENDING`

Webhook остаётся основным механизмом. Job нужен только как страховка от задержки/потери события.

Кандидаты:

```text
status = PENDING
providerCheckoutId IS NOT NULL
checkoutExpiresAt < now - gracePeriod
```

Рекомендуемый первый `gracePeriod` — конфигурация. Его значение нужно выбрать исходя из
наблюдаемой доставки webhook; сам grace period не является финансовым доказательством.

Для каждого кандидата:

1. Выполнить Stripe retrieve по `providerCheckoutId`.
2. Проверить корреляцию с Payment и Customer.
3. Применить состояние:

   ```text
   status=expired
     → CAS PENDING → CANCELED

   status=complete + payment_status=paid
     → обычная обработка SUCCEEDED

   status=open
     → оставить PENDING

   неоднозначный результат
     → оставить PENDING и повторить позднее
   ```

Для первого варианта достаточно идемпотентных conditional updates. Полноценный lease не нужен,
пока job не освобождает `CREATED/UNKNOWN` и не выполняет новые provider create operations.

Тесты:

- webhook и reconciliation одновременно применяют один terminal result;
- два экземпляра job дают один итоговый transition;
- локальное время истекло, но Stripe вернул `open` — reservation сохраняется;
- Stripe `expired` освобождает reservation;
- provider unavailable ничего не изменяет.

### Этап 5. Уточнить provider error classification

Текущий `VALIDATION_ERROR` слишком широкий для автоматического release.

Разделить минимум на:

```text
REJECTED_NOT_CREATED
UNAVAILABLE
UNKNOWN
```

Правила:

| Outcome | `Payment.status` | Reservation | Retry |
|---|---|---|---|
| `REJECTED_NOT_CREATED` | `CREATED → FAILED`, если утверждена такая семантика `FAILED` | освободить | новый user key после исправления причины |
| `UNAVAILABLE` | `CREATED` | удерживать | тот же key с backoff |
| `UNKNOWN` | `CREATED` | удерживать | ограниченный same-key recovery |

`StripeIdempotencyError` нельзя автоматически относить к `REJECTED_NOT_CREATED`; его нужно
классифицировать отдельно или консервативно считать retryable/unknown.

Переход `CREATED → FAILED` выполняется условно:

```text
WHERE status = CREATED
  AND providerCheckoutId IS NULL
```

После terminal status повтор того же пользовательского key не вызывает Stripe.

### Этап 6. Добавить минимальный recovery audit для `CREATED`

Рекомендуемые поля:

```text
providerCreateAttemptedAt DateTime?
lastProviderCreateOutcome ProviderCreateOutcome?
checkoutClosedAt DateTime?
checkoutClosureReason String?
```

Не обязательно вводить все поля одновременно. Минимально нужны:

- время первой provider create attempt;
- различие `UNAVAILABLE` и `UNKNOWN`;
- признак, что workflow закрыт и новый provider call запрещён.

Правила:

1. Перед Stripe create сохранить/claim-ить provider attempt через conditional update.
2. Retry использует тот же provider idempotency key.
3. Retry разрешён только внутри короткого конфигурируемого recovery window с запасом до Stripe
   idempotency retention boundary.
4. Истечение окна не освобождает reservation.
5. После окна `UNKNOWN` переводится в manual review/reconciliation required.
6. Late attach после закрытия workflow не применяется и создаёт alert.

В первой версии не требуется автоматически находить потерянную Session без ID: Stripe retrieve
требует `checkoutId`, а idempotency key не является lookup key.

### Этап 7. Операционный runbook для ambiguous `CREATED`

Runbook должен определить:

1. Как найти Stripe операции пользователя по Customer и временному диапазону.
2. Как проверить `metadata.paymentId` и `client_reference_id`.
3. Как attach-ить найденную Session к правильному Payment.
4. Когда допустимо подтвердить, что Session не создана.
5. Кто имеет право закрыть Payment и освободить reservation.
6. Как зафиксировать reason/evidence.
7. Что делать с late webhook после manual closure.

До появления безопасного operator tooling manual SQL update статуса не должен считаться штатным
способом освобождения reservation.

### Этап 8. Применение успешной initial purchase

Reservation для `SUCCEEDED` освобождается не по времени и не по завершению Checkout, а только после
надёжного применения оплаты:

```text
Payment.status = SUCCEEDED
Payment.subscriptionId = созданная локальная Subscription
```

Нужно обеспечить:

- идемпотентное создание Subscription по `paymentId`;
- retry при потерянном межсервисном ответе;
- сохранение `subscriptionId` после подтверждённого результата;
- alert на длительный `SUCCEEDED + subscriptionId=null`.

До реализации D2/application flow такие Payments намеренно продолжают удерживать initial reservation.

## 5. Рекомендуемая разбивка на PR

### PR 1 — Session TTL

- конфигурация 30 минут;
- `expires_at` в обоих Stripe Checkout modes;
- unit tests adapter/config.

### PR 2 — Reservation release через webhook

- integration tests `PENDING → CANCELED`;
- проверка повторного initial insert после expiry;
- тесты mismatch/duplicate/SUCCEEDED without subscription.

### PR 3 — Явная отмена Checkout

- provider `expireCheckout`;
- `CancelCheckoutUseCase`;
- gRPC/HTTP contract;
- CAS transition и тесты гонок.

### PR 4 — Reconciliation известных Session

- provider `retrieveCheckout`;
- scheduled job для overdue `PENDING`;
- conditional transitions, retry и метрики.

### PR 5 — Provider error semantics

- `REJECTED_NOT_CREATED / UNAVAILABLE / UNKNOWN`;
- conditional `CREATED → FAILED`;
- retry contract и error mapping.

### PR 6 — Recovery audit

- attempt/outcome/closure fields;
- ограниченное retry window;
- manual-review state/error;
- runbook и alerts.

### PR 7 — Subscription application

- идемпотентное применение `SUCCEEDED`;
- сохранение `subscriptionId`;
- recovery потерянного ответа D2.

## 6. Что реализовать первым

Начать следует не с background worker и не с новой reservation state machine.

Первая вертикаль:

```text
30-минутный expires_at
→ Stripe checkout.session.expired
→ Payment PENDING → CANCELED
→ partial unique index освобождён
→ новый initial Checkout разрешён
```

Она использует уже существующую модель, закрывает основной пользовательский сценарий и даёт
проверяемый результат без новых сущностей.

После этого добавить явное закрытие старой Session при смене плана. Reconciliation и
`CREATED/UNKNOWN` recovery идут следующими, потому что являются страховкой и исключительной веткой,
а не основным способом освобождения reservation.

## 7. Критерии готовности всей функции

1. Stripe Session действительно истекает через настроенный TTL.
2. Проверенный `checkout.session.expired` переводит только соответствующий `PENDING` Payment в
   `CANCELED`.
3. После `CANCELED` новый initial Payment создаётся с новым key.
4. До подтверждённого expiry второй initial Payment блокируется.
5. Пользователь может явно закрыть старую открытую Session и выбрать другой план.
6. Старую Session нельзя оплатить после успешного переключения плана.
7. Потерянный webhook восстанавливается через retrieve известной Session.
8. Timeout/retrieve failure не освобождают reservation.
9. `UNKNOWN` без Session ID не освобождается автоматически.
10. `SUCCEEDED` без `subscriptionId` удерживает reservation.
11. Все status transitions выполняются через conditional update и безопасны при повторе.
12. Зависшие `CREATED`, `PENDING` и `SUCCEEDED` наблюдаемы через метрики/alerts.

## 8. Условия для перехода к отдельной reservation state machine

Вернуться к модели `ACTIVE / RELEASED / CONSUMED` следует, если появится хотя бы одно условие:

- `PaymentStatus.FAILED` нельзя использовать для pre-checkout failure;
- требуется автоматический release `CREATED/UNKNOWN`;
- один Payment получает несколько Checkout attempts;
- появляется второй payment provider;
- manual ambiguous incidents становятся регулярными;
- SLA не допускает manual review;
- требуется отдельный audit reservation lifecycle.

До этого момента отдельная reservation state machine увеличит количество состояний и гонок, но не
решит фундаментальную проблему потерянного Stripe Session ID.
