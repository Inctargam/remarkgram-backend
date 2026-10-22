# Обработка событий платежного провайдера

Каталог содержит application use cases, которые применяют уже проверенные и нормализованные события
платёжного провайдера к локальной модели `Payment`. Каждый use case выполняется внутри переданного
`PaymentsTransactionContext`, отвечает за один вид события и возвращает унифицированный
`PaymentEventResult`.

## Как понимать события Stripe

Stripe сообщает не о состоянии нашей сущности `Payment`, а об изменении одного из своих объектов.
В текущем процессе важны три разных объекта:

- **Checkout Session** — страница и ограниченное по времени окно, в котором пользователь начинает
  оплату;
- **PaymentIntent** — намерение получить конкретную сумму и последовательность попыток списания;
- **Invoice** — счёт, обычно связанный с initial purchase или автоматическим продлением Subscription.

Событие одного объекта завершает только его собственный lifecycle. Например, закрытый Checkout не
всегда означает отменённый PaymentIntent, а неудачная попытка PaymentIntent не означает закрытый
Invoice.

### Короткая карта событий

| Событие | Что сообщает Stripe | Что происходит в Stripe | Terminal-сигнал |
| --- | --- | --- | --- |
| `checkout.session.completed` | Пользователь завершил Checkout | Session становится `complete`; сама оплата ещё может обрабатываться | Для Session — да; для денег — нет |
| `checkout.session.expired` | Время Checkout истекло | Session становится `expired`, продолжить её нельзя | Для Session — да |
| `payment_intent.succeeded` | Деньги успешно получены | PaymentIntent становится `succeeded` | Да, финансовый успех |
| `payment_intent.payment_failed` | Одна попытка списания не удалась | Обычно PaymentIntent снова ожидает способ оплаты; его можно повторить | Нет |
| `payment_intent.canceled` | PaymentIntent окончательно отменён | Новых списаний по этому PaymentIntent больше не будет | Да, отмена PaymentIntent |
| `invoice.paid` | Invoice оплачен | Invoice становится `paid` | Да, финансовый успех Invoice |
| `invoice.payment_failed` | Одна попытка оплатить Invoice не удалась | Invoice остаётся `open`; Stripe может повторить списание | Нет |
| `invoice.voided` | Invoice аннулирован | Invoice становится `void` и больше не подлежит оплате | Да, окончательная отмена Invoice |
| `invoice.marked_uncollectible` | Долг признан маловероятным к взысканию | Invoice становится `uncollectible`; автоматическое взыскание прекращается | Закрывает взыскание, но Invoice ещё можно вручную перевести в `paid` или `void` |

### Понятные примеры

#### Пользователь ввёл карту, но банк отказал

Stripe отправляет `payment_intent.payment_failed`. PaymentIntent обычно возвращается в состояние,
где можно указать другой способ оплаты и попробовать снова.

```text
PaymentIntent: попытка -> payment_failed -> новая карта -> succeeded
Наш Payment:   PENDING -------------------------------> SUCCEEDED
```

Поэтому failure нужно записать для аудита, но локальный Payment нельзя переводить в `FAILED` или
`CANCELED`.

#### Пользователь не завершил Checkout

Checkout Session остаётся открытой до истечения времени, после чего Stripe отправляет
`checkout.session.expired`. Эту же Session продолжить нельзя.

```text
Checkout Session: open -> expired
Наш Payment:      PENDING -> CANCELED
```

Такой переход локального Payment допустим, только если он представляет именно эту Checkout-попытку и
не существует другого активного provider flow для той же оплаты.

#### PaymentIntent отменён

Stripe отправляет `payment_intent.canceled`. Это означает, что конкретный PaymentIntent уже не сможет
создать успешное списание.

```text
PaymentIntent: requires_payment_method -> canceled
Наш Payment:   PENDING                 -> CANCELED
```

Переход безопасен только при однозначной связи локального Payment с этим PaymentIntent. Нельзя по
одному canceled PaymentIntent автоматически отменять Invoice или всю Subscription.

#### Автоматическое продление не прошло с первого раза

Stripe отправляет `invoice.payment_failed`; связанный Invoice остаётся `open`, а настройки Stripe могут
предусматривать повторные списания. Позже тот же Invoice может породить `invoice.paid`.

```text
Invoice:     open -> payment_failed -> retry -> paid
Наш Payment: ожидание -----------------------> SUCCEEDED
```

`invoice.payment_failed` и связанное `payment_intent.payment_failed` описывают неудачные попытки, а не
окончательный исход счёта.

#### Invoice окончательно закрыт без оплаты

Для этого нужны отдельные события:

- `invoice.voided` — счёт аннулирован и больше не может быть оплачен; это наиболее прямой кандидат на
  локальный `CANCELED`;
- `invoice.marked_uncollectible` — взыскание прекращено и долг списан как проблемный; для локальной
  модели это скорее кандидат на `FAILED`, но решение должно быть принято отдельно, потому что Stripe
  всё ещё разрешает вручную перевести такой Invoice в `paid` или `void`.

### Правило для локального `Payment`

Локальный статус изменяется не по слову `failed` или `canceled` в названии события, а только после двух
проверок:

1. Какой объект Stripe завершился: Checkout Session, PaymentIntent или Invoice?
2. Доказывает ли завершение этого объекта окончательный исход именно нашего Payment?

Финансовый успех подтверждают `payment_intent.succeeded` или `invoice.paid`. Окончательную отмену могут
подтвердить `checkout.session.expired`, `payment_intent.canceled` или `invoice.voided`, но только когда
локальный Payment однозначно принадлежит завершившемуся provider flow. События `*.payment_failed`
terminal-доказательством не являются.

Документация Stripe: [PaymentIntent lifecycle](https://docs.stripe.com/payments/paymentintents/lifecycle),
[Checkout Session](https://docs.stripe.com/api/checkout/sessions/object),
[Invoice lifecycle](https://docs.stripe.com/invoicing/overview).

## Когда создавать Payment для автоматического продления

### Решение

Локальный Payment типа `RENEWAL` следует создавать при получении `invoice.finalized` с
`billingReason=subscription_cycle`, до обработки первой попытки списания.

`invoice.created` для этого слишком ранний: Invoice ещё находится в `draft`, его можно изменить, а
связанный PaymentIntent может ещё отсутствовать. При `invoice.finalized` Invoice становится `open`, его
денежные поля и `collectionMethod` больше нельзя изменять, а Stripe создаёт PaymentIntent для
автоматического списания. Поэтому в этот момент уже существует стабильное обязательство на конкретную
сумму, но финансового успеха ещё нет.

```text
invoice.finalized
  -> создать RENEWAL Payment в PENDING
  -> попытка списания
       -> invoice.payment_failed -> оставить PENDING
       -> повторная попытка       -> оставить тот же Payment
       -> invoice.paid            -> перевести в SUCCEEDED
       -> invoice.voided          -> перевести в CANCELED
```

Один Stripe Invoice соответствует одному локальному renewal Payment. Несколько попыток списания и
несколько создаваемых Stripe PaymentIntent в рамках одного Invoice не должны создавать несколько
локальных Payments.

### Идентичность и корреляция

Главный внешний идентификатор renewal Payment — `providerInvoiceId`.

- На `(providerType, providerInvoiceId)` требуется уникальность.
- Повторная доставка `invoice.finalized` должна возвращать тот же Payment.
- `providerSubscriptionId` связывает Invoice с текущей provider Subscription и помогает найти
  локальную Subscription.
- `providerPaymentId` является ссылкой на текущий PaymentIntent, но не идентичностью renewal Payment:
  повторная попытка оплаты Invoice может использовать другой PaymentIntent.
- Локальный idempotency key должен детерминированно строиться из provider и `providerInvoiceId`.

Payment создаётся со следующими начальными значениями:

```text
type                  = RENEWAL
status                = PENDING
providerInvoiceId     = Invoice.id
providerSubscriptionId = Invoice subscription reference
providerPaymentId     = PaymentIntent ID, если он уже доступен
subscriptionId        = локальная Subscription
paidAt                = null
checkoutPurpose       = null
```

План, период, пользователь и локальная Subscription берутся из уже сохранённой связи с provider
Subscription. Сумма и валюта сверяются с финализированным Invoice. Несовпадение не должно создавать
частично заполненный Payment.

### Как последующие события работают с Payment

#### `invoice.payment_failed`

Находит renewal Payment по `providerInvoiceId`, записывает безопасные audit-данные попытки и оставляет
его в `PENDING`. Следующая попытка относится к тому же Payment.

#### `payment_intent.payment_failed`

Используется как дополнительное событие попытки. Оно может обогатить Payment значением
`providerPaymentId`, но не должно быть единственным основанием для создания renewal Payment, если из
нормализованного события невозможно достоверно получить Invoice. Для invoice-backed оплаты
авторитетным correlation root остаётся Invoice.

#### `invoice.paid`

Больше не создаёт сразу успешный renewal Payment. Оно находит существующий Payment по
`providerInvoiceId`, сверяет сумму, валюту, Subscription, Customer и доступные references, затем
атомарно переводит `PENDING -> SUCCEEDED` и устанавливает `paidAt`.

Если `invoice.paid` пришло раньше `invoice.finalized` или локальное создание Payment было пропущено,
обработчик должен выполнить идемпотентный `ensure renewal Payment` из данных Invoice и сразу подтвердить
его в одной транзакции. Это recovery-путь, а не основной сценарий.

#### `invoice.voided`

Находит Payment по `providerInvoiceId` и переводит `CREATED/PENDING -> CANCELED`. Уже успешный Payment
не понижается.

#### `invoice.marked_uncollectible`

До отдельного бизнес-решения не меняет статус Payment. Если будет принято решение отражать списанный
долг как `FAILED`, переход должен выполняться только по этому Invoice event, а не по одному из
предыдущих `*.payment_failed`.

### Защита от порядка доставки

Каждый Invoice handler должен начинаться с одной идемпотентной операции `ensure renewal Payment`:

1. найти Payment по `(providerType, providerInvoiceId)`;
2. если он существует — проверить неизменяемые данные и использовать его;
3. если его нет и событие содержит достаточный invoice context — создать `RENEWAL/PENDING`;
4. в той же транзакции применить текущее событие;
5. конфликт references завершить как `DEAD` без partial update.

Так failure, success или terminal event не потеряются, даже если `invoice.finalized` не был доставлен
или события были обработаны не в ожидаемом порядке.

### Что нужно изменить в текущей реализации

Сейчас `ConfirmInvoicePaidUseCase` вызывает `createSuccessfulRenewal` и создаёт renewal Payment только
после финансового успеха. Для целевой модели нужны отдельные шаги:

1. добавить поддержку и нормализацию `invoice.finalized`;
2. добавить idempotent use case создания `RENEWAL/PENDING`;
3. заменить `createSuccessfulRenewal` на `ensurePendingRenewal` и отдельное подтверждение успеха;
4. перевести `invoice.payment_failed` на корреляцию с уже созданным Payment по Invoice;
5. добавить `invoice.voided` как terminal cancellation для неоплаченного renewal;
6. сохранить recovery-upsert в обработчиках `invoice.paid`, `invoice.payment_failed` и
   `invoice.voided`;
7. отдельно решить поведение для Invoice с нулевой суммой и `invoice.marked_uncollectible`.

Документация Stripe: [Invoice events](https://docs.stripe.com/api/events/types),
[Invoice finalization](https://docs.stripe.com/api/invoices),
[Invoice status transitions](https://docs.stripe.com/invoicing/overview).

## Назначение use cases

### `ApplyCheckoutSessionCompletedUseCase`

Обрабатывает событие `checkout.session.completed`.

**Намерение события:** сообщить, что пользователь завершил Checkout Session и провайдер сформировал
связанные платёжные объекты. Событие предназначено для корреляции и обогащения локального Payment
provider references, но не для подтверждения фактического получения денег.

- Находит локальный Payment по `paymentId` из metadata.
- Проверяет provider, сумму, валюту, Customer и уже сохранённые provider references.
- Сохраняет `providerCheckoutId` и доступные ссылки на объект оплаты:
  - для `mode=payment` — `providerPaymentId`;
  - для `mode=subscription` — `providerSubscriptionId`.
- Повтор того же события обрабатывает идемпотентно.

Этот use case только обогащает Payment ссылками провайдера. Завершение Checkout Session не доказывает
получение денег и не переводит Payment в `SUCCEEDED`.

### `CancelExpiredCheckoutSessionUseCase`

Обрабатывает событие `checkout.session.expired`.

**Намерение события:** сообщить, что время жизни Checkout Session истекло и оплатить именно через эту
сессию больше нельзя. Это terminal-сигнал для соответствующей незавершённой попытки Checkout, который
разрешает закрыть локальный `CREATED` или `PENDING` Payment как `CANCELED`.

- Ищет Payment по `paymentId` из metadata, а при его отсутствии — по `providerCheckoutId`.
- Сверяет provider, сумму, валюту, Customer и Checkout reference.
- Переводит незавершённый Payment из `CREATED` или `PENDING` в `CANCELED`.
- Не изменяет Payment, который уже находится в другом terminal-состоянии.
- Повтор события для уже отменённого Payment считает успешным идемпотентным результатом.

Назначение use case — зафиксировать подтверждённое провайдером окончание неоплаченной Checkout Session,
а не ошибку отдельной попытки списания.

### `CancelPaymentIntentUseCase`

Обрабатывает событие `payment_intent.canceled`.

**Намерение события:** сообщить, что провайдер окончательно отменил конкретный PaymentIntent и дальнейшее
списание по нему не ожидается. В текущей модели этот сигнал используется только для отмены ручной
покупки продления подписки, связанной с данным PaymentIntent.

- Ищет Payment сначала по `paymentId` из metadata, затем по `providerPaymentId`.
- Применяется только к `PURCHASE` с назначением `SUBSCRIPTION_EXTENSION`.
- Проверяет provider и отсутствие конфликтов PaymentIntent/Customer references.
- Переводит Payment из `CREATED` или `PENDING` в `CANCELED`.
- Сохраняет идемпотентность для повторной доставки того же события и не понижает уже terminal Payment.

Use case намеренно не отменяет initial purchase, renewal или успешно завершённый Payment.

### `ConfirmInvoicePaidUseCase`

Обрабатывает событие `invoice.paid` и выбирает сценарий по `billingReason`.

**Намерение события:** подтвердить, что Invoice действительно оплачен. Это доверенный финансовый сигнал,
который доказывает успешную оплату initial subscription при `subscription_create` либо очередного
автоматического периода при `subscription_cycle`.

Для `subscription_create`:

- находит исходный initial purchase;
- проверяет, что это `PURCHASE` с назначением `INITIAL_SUBSCRIPTION`;
- сверяет финансовые данные и provider references;
- переводит Payment в `SUCCEEDED`, фиксирует `paidAt` и ссылки Invoice, Subscription, PaymentIntent и
  Customer.

Для `subscription_cycle`:

- находит исходный Payment по `providerSubscriptionId`;
- проверяет наличие локального `subscriptionId` и согласованность контекста;
- идемпотентно создаёт новый успешный Payment типа `RENEWAL`;
- переносит в renewal снимок плана, суммы, периода и связь с локальной Subscription.

Другие значения `billingReason` считаются неподдерживаемыми. Успешный результат содержит
`SuccessfulPayment`, который используется следующим шагом workflow для применения оплаты к Subscription.

### `ConfirmPaymentIntentSucceededUseCase`

Обрабатывает событие `payment_intent.succeeded`.

**Намерение события:** подтвердить, что разовое списание через PaymentIntent успешно завершено и деньги
получены. В текущем контексте событие является финансовым доказательством оплаты ручного продления
подписки (`PURCHASE + SUBSCRIPTION_EXTENSION`).

- Ищет Payment по `paymentId` из metadata или по `providerPaymentId`.
- Подтверждает только `PURCHASE` с назначением `SUBSCRIPTION_EXTENSION`.
- Сверяет provider, сумму, валюту, Customer и PaymentIntent reference.
- Переводит Payment из `CREATED` или `PENDING` в `SUCCEEDED`, устанавливает `paidAt` и обогащает
  provider references.
- Возвращает `SuccessfulPayment` для дальнейшего применения оплаченного периода к Subscription.

Повтор события для уже успешного Payment идемпотентен. Конфликт реквизитов не приводит к частичному
обновлению.

### `RecordInvoicePaymentFailedUseCase`

Обрабатывает событие `invoice.payment_failed` как audit/correlation-событие.

**Намерение события:** сообщить о неудачной попытке оплатить Invoice. Событие фиксирует операционный факт
неуспеха и помогает сопоставить его с локальным Payment, но не доказывает окончательную невозможность
оплаты: провайдер может повторить списание, после чего придёт событие успеха.

- Пытается сопоставить событие с Payment по metadata `paymentId`, затем по `providerInvoiceId`, затем
  по `providerSubscriptionId`.
- На каждом этапе принимает Payment только при совместимых provider references.
- Возвращает успешный результат `PAYMENT_FAILURE_RECORDED`, даже если однозначно связать событие с
  локальным Payment не удалось.

Use case не меняет lifecycle-статус Payment: неуспешная попытка оплаты может быть повторена, а более
позднее событие успеха всё ещё должно быть применимо.

### `RecordPaymentIntentFailedUseCase`

Обрабатывает событие `payment_intent.payment_failed` как audit/correlation-событие.

**Намерение события:** сообщить, что отдельная попытка списания по PaymentIntent завершилась неудачно.
Это retryable-сигнал для аудита и корреляции, а не terminal-решение о судьбе Payment; тот же платёж всё
ещё может завершиться успешно после следующей попытки.

- Ищет Payment по `paymentId` из metadata или по `providerPaymentId`.
- Проверяет совпадение provider и отсутствие конфликта PaymentIntent reference.
- Возвращает `PAYMENT_FAILURE_RECORDED` для корректно сопоставленного события.

Use case не переводит Payment в `FAILED`: событие сообщает о неудачной попытке, но не доказывает
терминальный исход платежа.

#### Проверка ограничения по типу оплаты

`RecordPaymentIntentFailedUseCase` уже не ограничен сочетанием
`PURCHASE + SUBSCRIPTION_EXTENSION`: он не проверяет ни `PaymentType`, ни `CheckoutPurpose` и может
сопоставлять `payment_intent.payment_failed` с любым локальным Payment по metadata `paymentId` либо по
сохранённому `providerPaymentId`.

Ограничение `PURCHASE + SUBSCRIPTION_EXTENSION` было введено не для failure-события, а для двух других
сценариев:

- `payment_intent.succeeded` — финансовый success через PaymentIntent сейчас считается авторитетным
  только для разовой оплаты продления; initial purchase и automatic renewal подтверждаются через
  `invoice.paid`, где доступны Invoice и Subscription references вместе с `billingReason`;
- `payment_intent.canceled` — terminal cancellation сейчас разрешена только для локальной разовой
  checkout-оплаты продления. Для invoice-backed оплат terminal-решение должно приниматься по lifecycle
  Invoice, а не только по состоянию связанного PaymentIntent.

Таким образом, это ограничение нельзя механически переносить на `payment_intent.payment_failed` и не
нужно снимать с success/cancellation use cases в рамках реализации failure-события. Failure остаётся
audit/correlation-событием для всех типов Payment и не выполняет lifecycle transition.

#### Дополнительные шаги реализации для всех оплат

1. Получить sanitized Stripe fixtures `payment_intent.payment_failed` для всех поддерживаемых путей:
   initial purchase, subscription extension и automatic renewal.
2. Для каждого пути проверить, создаёт ли Stripe отдельное `payment_intent.payment_failed` помимо
   `invoice.payment_failed`, и определить авторитетный источник локального `paymentId`.
3. Проверить фактическое расположение PaymentIntent ID в Stripe API version проекта и устранить
   известный дефект, при котором `providerPaymentId` может не извлекаться или не сохраняться.
4. Зафиксировать порядок корреляции: metadata `paymentId` как основной источник, сохранённый
   `providerPaymentId` как fallback. Для invoice-backed событий определить безопасный fallback через
   Invoice/Subscription только при наличии этих references в нормализованном контракте; не подменять
   PaymentIntent ID идентификатором Invoice, Checkout, Charge или Subscription.
5. Расширить нормализованный event только allowlisted audit-полями, необходимыми для безопасной
   корреляции. Не переносить card или payment-method details и не сохранять произвольный provider
   message без действующей redaction policy.
6. Проверять provider и все присутствующие provider references по правилу nullable knowledge:
   отсутствие входящего значения не является конфликтом, разные непустые значения являются
   `REFERENCE_CONFLICT`.
7. Сохранить одинаковую lifecycle-семантику для `PURCHASE`, `RENEWAL`, initial purchase и extension:
   событие регистрирует неудачную попытку, но не устанавливает `FAILED` или `CANCELED` и не понижает
   `SUCCEEDED`.
8. Определить durable audit-запись неудачной попытки. Текущий use case возвращает
   `PAYMENT_FAILURE_RECORDED`, но сам не сохраняет отдельную историю попыток; название результата не
   должно обещать persistence, пока соответствующий audit contract и repository operation не
   определены.
9. Добавить unit-сценарии для каждого `PaymentType`/`CheckoutPurpose`, событий без metadata, duplicate,
   уже успешного Payment, provider mismatch и reference conflict.
10. Добавить integration-сценарии прохождения события через Stripe adapter, workflow и transaction
    boundary, включая поздний success после одного или нескольких failure-событий.

До выполнения шагов 1–4 нельзя считать поддержку всех видов оплаты доказанной только отсутствием
проверки `PaymentType` в текущем use case.

## Общая семантика результата

- `SUCCESS` — событие применено либо корректно распознано как идемпотентный повтор.
- `IGNORED` — событие осознанно не применено, например Payment не найден или уже находится в
  несовместимом terminal-состоянии.
- `DEAD` — событие нельзя безопасно применить из-за нарушения инварианта или reconciliation conflict.

Отсутствующая nullable provider reference означает отсутствие нового знания. Конфликт возникает только
тогда, когда сохранённое и входящее непустые значения различаются.
