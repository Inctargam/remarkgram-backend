# Successful Payment: стык D1 → D2 в DBOS workflow

## Назначение

Документ описывает стык, в котором Payment Module (D1) после подтверждения оплаты вызывает
Subscription Module (D2). Источником фактической последовательности является
`DbosPaymentWebhookWorkflow.processPaymentWebhookV5`; общие правила и принятые решения находятся в
[agent-context.md](./agent-context.md).

Этот сценарий начинается не при создании Checkout, а после того, как доверенное provider event уже
подтвердило финансовый success и D1 зафиксировал `Payment.status=SUCCEEDED` с ненулевым `paidAt`.

## Что должен реализовать разработчик D2

D1 определяет два outbound application ports. Абстракции находятся в D1, потому что именно D1
является вызывающей стороной и формулирует необходимый ему контракт. Concrete implementations
принадлежат D2 и должны делегировать работу в application use cases D2, а не обращаться к D2
persistence непосредственно из D1 workflow.

| D1 port                      | Когда вызывает D1                                                            | Что реализует D2                                                                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SubscriptionContextPort`    | `CreateCheckoutUseCase`, до создания Payment и до обращения к provider       | Контекст активной Subscription: ID или null для различения покупок и сохранения targetSubscriptionId. |
| `SubscriptionPaymentHandler` | `DbosPaymentWebhookWorkflow`, только после подтверждённого financial success | Применение успешного Payment к Subscription lifecycle, фиксация завершения старой provider-связи и binding новой provider Subscription.                 |

В `PaymentsModule` подключены:

```ts
{ provide: SubscriptionContextPort, useClass: LocalSubscriptionContextAdapter }
{ provide: SubscriptionsQueryRepository, useClass: PrismaSubscriptionsQueryRepository }
{ provide: SubscriptionPaymentHandler, useClass: LocalSubscriptionPaymentHandlerAdapter }
{ provide: SubscriptionsRepository, useClass: PrismaSubscriptionsRepository }
```

`LocalSubscriptionContextAdapter` вызывает D2 query handler через `QueryBus`. Репозиторий
читает подписку пользователя со статусом `ACTIVE` или `PENDING`, для которой
`startsAt <= now < expiresAt`; возвращает ID или null, а при нескольких совпадениях — ошибку.
Для работы нужна применённая миграция подписок.
`LocalSubscriptionPaymentHandlerAdapter.applySuccessfulPayment` передаёт команду через `CommandBus`
в `ApplySuccessfulPaymentUseCase`. После блокировки по пользователю use case читает сохранённый
результат по `paymentId` в переданной транзакции и при повторе возвращает его без изменений.
Первая PURCHASE реализована: D2 создаёт период от `paidAt`, сохраняет provider-привязку и результат
CREATED в той же транзакции. Текущие/будущие периоды, пересечения с историческими периодами,
незавершённые изменения и прежнее включённое автопродление исключают ветку первой покупки.
Месяцы считаются календарно с ограничением последним днём месяца; обработка запоздавшего события
не сдвигает даты доступа. Дополнительная покупка создаёт строку после последнего оплаченного
периода, сохраняет связь операции со старой подпиской и состояния DISABLING/ENABLING с paymentId.
RENEWAL находит подписку пользователя по provider + providerSubscriptionId и продлевает её
от текущего expiresAt без изменения настройки автопродления. Повтор каждого action возвращает
сохранённый результат; все изменения используют переданную транзакцию и блокировку по userId.
Подробные правила и ограничения приведены в карточке 2 `d2-method-cards.md`.
`markProviderSubscriptionCancellationScheduled` реализован: через сохранённую операцию переводит
старую подписку из DISABLING в RETIRED, повтор не меняет состояние.
`bindProviderSubscription` реализован: по paymentId находит SCHEDULED-операцию, сохраняет новый
provider ID и завершает ENABLING → ENABLED. Поздний replay не меняет настройки автопродления.
События Business-доступа ещё не публикуются.

Рекомендуемая декомпозиция внутри D2:

```text
D1 SubscriptionContextPort
  -> D2 adapter
  -> FindActiveSubscriptionForPurchaseQueryHandler

D1 SubscriptionPaymentHandler.applySuccessfulPayment
  -> D2 adapter
  -> ApplySuccessfulPaymentUseCase

D1 SubscriptionPaymentHandler.markProviderSubscriptionCancellationScheduled
  -> D2 adapter
  -> MarkProviderSubscriptionCancellationScheduledUseCase

D1 SubscriptionPaymentHandler.bindProviderSubscription
  -> D2 adapter
  -> BindProviderSubscriptionUseCase
```

Названия D2 use cases могут отличаться, но четыре обязанности должны оставаться раздельными. Read
query не должен изменять Subscription, а provider-transition methods не должны повторно применять
оплаченный период.

## Граница 1: `SubscriptionContextPort`

Файл контракта:
`apps/payments/src/features/payments/application/ports/subscription-context.port.ts`.

```ts
abstract class SubscriptionContextPort {
  abstract findActiveSubscriptionForPurchase(userId: number): Promise<{ subscriptionId: string } | null>;
}
```

### `findActiveSubscriptionForPurchase`

D1 получает `{ subscriptionId }` при наличии текущей подписки или null при отсутствии.
ID сохраняется в Payment.targetSubscriptionId. Метод не резервирует период; резервация остаётся в Payments.
Ошибки чтения D1 преобразует в PaymentSubscriptionContextError и не создаёт Payment/Checkout.
D2 ищет ACTIVE/PENDING с startsAt <= now < expiresAt. Несколько совпадений — MultipleActiveSubscriptionsError.

## Граница 2: `SubscriptionPaymentHandler`

Файл контракта:
`apps/payments/src/features/payments/application/ports/subscription-payment.handler.ts`.

```ts
abstract class SubscriptionPaymentHandler {
  abstract applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: PaymentsTransactionContext,
  ): Promise<ApplySuccessfulPaymentResult>;

  abstract markProviderSubscriptionCancellationScheduled(
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void>;

  abstract bindProviderSubscription(
    paymentId: string,
    subscriptionId: string,
    providerSubscriptionId: string,
    tx: PaymentsTransactionContext,
  ): Promise<void>;
}
```

Все три метода являются D1 → D2 boundary. Их production implementation принадлежит D2. Переданный
`PaymentsTransactionContext` означает, что D2 changes должны участвовать в той же локальной
транзакции, что и соответствующие изменения D1. Метод не должен commit/rollback транзакцию
самостоятельно и не должен сохранять `tx` после возврата.

### Метод `applySuccessfulPayment`

Вызывающий D1 use case: `LinkPaymentToSubscriptionUseCase` внутри
`linkPaymentToSubscriptionStep` DBOS workflow.

Назначение D2 use case: идемпотентно применить один доказанный успешный Payment к Subscription
lifecycle и вернуть D1 принятое бизнес-решение. Это единственный метод стыка, который создаёт новый
локальный период, продлевает существующий период либо планирует будущую Subscription.

Вход:

- `payment` — полный immutable `SuccessfulPayment`, описанный ниже;
- `tx` — текущая локальная транзакция step 2;
- idempotency identity — `payment.paymentId`.

Результат:

```ts
type ApplySuccessfulPaymentResult = {
  subscriptionId: string;
  action: 'CREATED' | 'SCHEDULED' | 'RENEWED';
  nextSubscriptionStartsAt: string;
  previousProviderSubscriptionId: string | null;
};
```

| Поле результата                  | Что обязан вернуть D2                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `subscriptionId`                 | UUID Subscription, которую D2 создал или выбрал как фактический результат применения Payment. Replay того же `paymentId` обязан вернуть тот же `subscriptionId`.                                                                                                                                                                                                                                 |
| `action=CREATED`                 | Создана новая локальная Subscription/первый период. Допустимо для `PURCHASE`, недопустимо для `RENEWAL`.                                                                                                                                                                                                                                                                                                                                                     |
| `action=RENEWED`                 | Existing Subscription получила идемпотентный renewal-период. Обязательно для `PaymentType.RENEWAL`, недопустимо для `PURCHASE`.                                                                                                                                                                                                                                                                                                                              |
| `action=SCHEDULED`               | D2 создал/выбрал будущую локальную Subscription или период и требует заменить текущую provider Subscription. Допустимо для `PURCHASE`. После ответа D1 продолжит steps 3–4.                                                                                                                                                                                                                                                                                  |
| `nextSubscriptionStartsAt`       | Canonical UTC ISO-8601, рассчитанный D2. Для `SCHEDULED` это момент начала следующего provider-managed billing period и первого следующего автоматического списания после окончания всей уже оплаченной локальной цепочки периодов, включая период, предоставленный текущим Payment. D1 без изменения использует значение как `billing_cycle_anchor`. Текущий контракт требует поле для всех actions, хотя downstream использует его только для `SCHEDULED`. |
| `previousProviderSubscriptionId` | Для `SCHEDULED` — обязательный непустой ID provider Subscription, которую D1 должен перевести в `cancel_at_period_end=true`. Для `CREATED`/`RENEWED` должен быть `null`.                                                                                                                                                                                                                                                                                     |

#### Семантика `nextSubscriptionStartsAt`

Несмотря на общее название, для ветки `SCHEDULED` поле означает не время обработки webhook и не
начало периода, который пользователь только что оплатил. Это будущая граница, с которой новая
provider Subscription может начать регулярный billing: к этому моменту должны завершиться все
локальные периоды доступа, уже оплаченные до следующего автоматического списания.

D2 вычисляет значение по собственной упорядоченной цепочке Subscription/periods:

```text
active period
  -> ранее запланированные оплаченные периоды, если есть
  -> период, оплаченный текущим Payment
  -> nextSubscriptionStartsAt
  -> первый автоматический charge новой provider Subscription
```

Пример:

```text
Текущая активная Subscription:     2026-10-01T00:00:00Z — 2026-11-01T00:00:00Z
Купленный сейчас период:           2026-11-01T00:00:00Z — 2026-12-01T00:00:00Z
nextSubscriptionStartsAt:          2026-12-01T00:00:00.000Z
Первое следующее автосписание:      2026-12-01T00:00:00.000Z
```

Если между активным периодом и текущей покупкой уже существуют другие оплаченные/PENDING периоды,
D2 ставит новый период после них, а `nextSubscriptionStartsAt` возвращает конец всей получившейся
оплаченной цепочки. Поэтому значение нельзя вычислять как `payment.paidAt + periodCount`.

Также значение нельзя брать из Stripe `current_period_end`: provider может не знать о локально
докупленных периодах. Локальный порядок D2 является источником истины. D1 только проверяет canonical
UTC ISO-8601 и передаёт timestamp в provider как `billing_cycle_anchor`; D1 не прибавляет период и не
корректирует дату.

Для `CREATED` и `RENEWED` steps создания replacement provider Subscription не выполняются, поэтому
workflow не использует это поле как billing anchor. D2 всё равно обязан вернуть валидную ISO-строку,
пока поле остаётся обязательным в текущем контракте.

Состояния/решения, которые должен различить D2:

- Payment уже применён — вернуть ранее сохранённый результат без второго периода;
- первый `PURCHASE` — создать локальную Subscription и вернуть `CREATED`;
- automatic `RENEWAL` — продлить правильную Subscription и вернуть `RENEWED`;
- дополнительный `PURCHASE`, требующий последовательного будущего периода и замены provider binding —
  вернуть `SCHEDULED`;
- Payment нельзя применить из-за D2 invariant/ownership/state conflict — завершить вызов явной
  business error; нельзя молча выбрать произвольную Subscription;
- infrastructure failure — выбросить ошибку, чтобы общая транзакция откатилась и DBOS мог повторить
  step.

До возврата D2 должен сохранить достаточно данных, чтобы replay по `paymentId` воспроизвёл тот же
`ApplySuccessfulPaymentResult`, включая action, `subscriptionId`, start и previous provider ID.

### Метод `markProviderSubscriptionCancellationScheduled`

D1 вызывает `recordScheduled` после внешнего подтверждения `cancel_at_period_end=true`.
Аргументы: ID новой локальной `subscriptionId`, старый `providerSubscriptionId`, общий `tx`.

- Найти единственную SCHEDULED-операцию по subscriptionId и старому provider ID (take: 2),
  взять lock пользователя и повторить поиск. Отсутствие или неоднозначность — конфликт.
- Требовать SCHEDULED, previousSubscriptionId и совпадение provider ID с сохранённым
  previousProviderSubscriptionId. Ошибка — SubscriptionCancellationConflictError.
- При CANCELLATION_PENDING одной nested-записью сохранить старой подписке RETIRED
  с autoRenewalChangeId=paymentId, операции — BINDING_PENDING.
- При BINDING_PENDING или COMPLETED вернуть успешный повтор без записи.
- Не менять даты, provider ID и новую подписку. Старая связь больше не принимает enable/disable.

### Метод `bindProviderSubscription`

D1 вызывает `recordCreated` после создания новой provider-подписки.
Аргументы: `paymentId`, новая локальная `subscriptionId`, новый `providerSubscriptionId`, общий `tx`.

- Получить владельца операции, взять тот же lock и перечитать её по paymentId.
- Требовать SCHEDULED и совпадение входящего subscriptionId со связью операции.
- При BINDING_PENDING одной nested-записью сохранить новой подписке provider ID и ENABLED,
  операции — COMPLETED и boundProviderSubscriptionId. Даты, статус доступа и change ID не менять.
- При COMPLETED сравнить входящий provider ID с boundProviderSubscriptionId:
  совпадение — повтор без записи, различие — конфликт. Текущие настройки подписки не влияют на replay.
- При CANCELLATION_PENDING вернуть конфликт: отключение ещё не подтверждено.
- Ошибки аргументов, этапа и уникальности provider-привязки — SubscriptionBindingConflictError;
  остальные ошибки БД передавать вызывающей стороне.

### Сохранённый этап и гарантии

SubscriptionPaymentApplication хранит неизменяемый публичный результат applySuccessfulPayment,
изменяемый processingStatus и неизменяемый после привязки boundProviderSubscriptionId.
SCHEDULED проходит CANCELLATION_PENDING → BINDING_PENDING → COMPLETED.
CREATED и RENEWED сразу сохраняются с COMPLETED и null в boundProviderSubscriptionId.
Повтор applySuccessfulPayment возвращает только публичный результат, без служебных полей операции.

Корректность владельцев и связей обеспечивается при создании операции; связи неизменяемы.
Завершающие методы не загружают состояния обеих подписок для повторной проверки.
ENABLING/DISABLING и общий lock продолжают защищать от конкурирующих ручных изменений;
RETIRED остаётся терминальным состоянием старой связи. Непустой новый provider ID гарантирует D1.

Оба метода используют переданный tx, не вызывают provider API и не начисляют доступ повторно.
`void` означает локальную фиксацию; commit выполняет D1. Ошибка откатывает весь шаг,
включая D1 Payment binding и отметку webhook. Формат сохранённых аргументов workflow не меняется:
recordScheduled передаёт params.subscriptionId согласно действующему контракту.

## Краткий алгоритм D2 implementation

1. До Checkout отвечать через `findActiveSubscriptionForPurchase`, не изменяя состояние.
2. После financial success получить `SuccessfulPayment` в `applySuccessfulPayment`.
3. Найти ранее применённый результат по `paymentId`; при наличии вернуть его.
4. По текущему D2 lifecycle определить `CREATED`, `RENEWED` или `SCHEDULED` и атомарно сохранить
   результат применения.
5. Для `CREATED`/`RENEWED` больше вызовов D2 в этом workflow не будет.
6. Для `SCHEDULED` дождаться отдельного вызова `markProviderSubscriptionCancellationScheduled` после
   provider confirmation.
7. Затем принять `bindProviderSubscription` с новым provider ID и завершить transition.

## Владение решением

D1 доказывает, что деньги оплачены, и передаёт D2 неизменяемый снимок успешного Payment. D2 решает,
что этот Payment означает для Subscription:

- создать первую локальную Subscription;
- продлить существующую Subscription;
- запланировать следующий период и замену provider Subscription.

D1 не выбирает локальный `subscriptionId`, не вычисляет период доступа и не выводит действие D2 из
`CheckoutPurpose`. D2 не меняет Payment напрямую: связь с выбранной Subscription фиксирует D1 через
свой repository.

## Последовательность DBOS workflow

```text
provider webhook
  -> persistPaymentEventStep
  -> applyPaymentEventStep
       D1 financial reconciliation
       PaymentEventResult
  -> linkPaymentToSubscriptionStep             только SUCCESS + PAYMENT_SUCCEEDED
       D2 applySuccessfulPayment
       D1 Payment.subscriptionId binding
       FINISHED | SCHEDULED
  -> scheduleProviderSubscriptionCancellationStep  только SCHEDULED
       provider cancel_at_period_end=true
       D2 markProviderSubscriptionCancellationScheduled
  -> createDeferredProviderSubscriptionStep        только SCHEDULED
       provider creates replacement Subscription
       D1 binds Payment.providerSubscriptionId
       D2 bindProviderSubscription
       webhook -> PROCESSED
```

В текущем workflow `CREATED` и `RENEWED` завершаются внутри
`linkPaymentToSubscriptionStep`. Только `SCHEDULED` продолжает provider steps.

## Step 1: результат D1 financial reconciliation

`ApplyPaymentEventUseCase` возвращает общий для event-specific use cases discriminated union:

```ts
type PaymentEventResult =
  | { status: 'SUCCESS'; code: PaymentEventResultCode; paymentId: string | null }
  | {
      status: 'SUCCESS';
      code: 'PAYMENT_SUCCEEDED';
      paymentId: string;
      payment: SuccessfulPayment;
    }
  | { status: 'IGNORED' | 'DEAD'; code: PaymentEventResultCode };
```

Только `SUCCESS + PAYMENT_SUCCEEDED` означает, что Payment финансово подтверждён и должен быть
идемпотентно применён в D2. Остальные комбинации завершаются в step 1 согласно статусу. `eventId`
остаётся контекстом DBOS workflow и передаётся в step 2 coordinator-ом, а не дублируется в результате.

### `SuccessfulPayment`

Для первой покупки добавлен `providerSubscriptionId`: сохранённая D1 provider-привязка,
которую D2 записывает в новую локальную Subscription. Поле необязательное для совместимости
со старыми workflow snapshots. Перед вызовом D2 `LinkPaymentToSubscriptionUseCase` заполняет
его из актуального Payment. При запрошенном автопродлении первая покупка без этого ID отклоняется.

```ts
type SuccessfulPayment = Readonly<{
  paymentId: string;
  userId: number;
  planId: number;
  type: PaymentType;
  autoRenewalRequested: boolean | null;
  targetSubscriptionId: string | null;
  amount: number;
  currency: Currency;
  periodCount: number;
  periodUnit: PeriodUnit;
  provider: PaymentProvider;
  providerCustomerId: string | null;
  providerSubscriptionId?: string | null;
  paidAt: string;
}>;
```

| Поле                        | Источник и значение                                                                                                         | Как D2 использует значение                                                                                                                                                                                                                                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `paymentId`                 | UUID успешного Payment                                                                                                      | Idempotency identity применения Payment. Повтор с тем же ID не создаёт второй период или Subscription.                                                                                                                                                                                                                                                          |
| `userId`                    | Владелец Payment                                                                                                            | Определяет владельца локальной Subscription.                                                                                                                                                                                                                                                                                                                    |
| `planId`                    | Оплаченный Plan                                                                                                             | Определяет приобретаемый план; D2 получает нужные plan rules через согласованный контракт, а не доверяет transport DTO.                                                                                                                                                                                                                                         |
| `type`                      | `PURCHASE` или `RENEWAL`                                                                                                    | `RENEWAL` обязан вернуть действие `RENEWED`; `PURCHASE` не может вернуть `RENEWED`.                                                                                                                                                                                                                                                                             |
| `autoRenewalRequested`      | Снимок намерения пользователя при покупке                                                                                   | Используется только как входное намерение при создании/планировании Subscription; не является текущим состоянием auto-renewal.                                                                                                                                                                                                                                  |
| `amount`, `currency`        | Подтверждённые финансовые параметры                                                                                         | Audit и данные для последующей provider Subscription в ветке `SCHEDULED`; не используются D2 как доказательство success вместо статуса D1.                                                                                                                                                                                                                      |
| `periodCount`, `periodUnit` | Оплаченная длительность                                                                                                     | D2 вычисляет границы периода и не допускает пересечений.                                                                                                                                                                                                                                                                                                        |
| `provider`                  | Сейчас `STRIPE`                                                                                                             | Provider binding context.                                                                                                                                                                                                                                                                                                                                       |
| `providerCustomerId`        | Nullable provider Customer ID                                                                                               | Для `SCHEDULED` D1 позднее требует ненулевое значение при создании новой provider Subscription.                                                                                                                                                                                                                                                                 |
| `paidAt`                    | Canonical UTC ISO-8601                                                                                                      | Время доказанного success; не обязательно совпадает с началом будущего периода.                                                                                                                                                                                                                                                                                 |

DTO должен оставаться сериализуемым: даты передаются ISO-строками, а не объектами `Date`.

`CheckoutPurpose` не входит в `SuccessfulPayment` и не пересекает границу D1 → D2. Это сохранённое
в Payment намерение исходного Checkout и часть pre-payment concurrency policy. D1 использует его до
формирования post-success DTO там, где это требуется сценарием создания Checkout и financial
reconciliation. После подтверждённого success D2 самостоятельно определяет результат применения
Payment и возвращает явное действие `CREATED`, `SCHEDULED` или `RENEWED`; восстанавливать это решение
по `CheckoutPurpose` нельзя.

### Контекст покупки

D1 использует результат findActiveSubscriptionForPurchase для выбора CheckoutPurpose
и сохраняет найденный ID в Payment.targetSubscriptionId. Поле входит в SuccessfulPayment.
D2 не использует его для выбора очереди: PURCHASE определяется по userId, RENEWAL — по provider-связи.
Удаление поля из контракта остаётся предложением для D1.

## Step 2: `SubscriptionPaymentHandler.applySuccessfulPayment`

Application boundary:

```ts
abstract class SubscriptionPaymentHandler {
  abstract applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: PaymentsTransactionContext,
  ): Promise<ApplySuccessfulPaymentResult>;
}

type ApplySuccessfulPaymentResult = {
  subscriptionId: string;
  action: 'CREATED' | 'SCHEDULED' | 'RENEWED';
  nextSubscriptionStartsAt: string;
  previousProviderSubscriptionId: string | null;
};
```

### Параметры вызова

| Параметр  | Значение                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payment` | Неизменяемый сериализуемый snapshot из step 1.                                                                                                                                                          |
| `tx`      | Общий локальный `PaymentsTransactionContext`, созданный внутри DBOS step. D2 обязан выполнять свои изменения через этот transaction context. Контекст нельзя сохранять или передавать в следующий step. |

### Результат D2

| Поле                             | Требования                                                                                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `subscriptionId`                 | UUID фактически созданной или выбранной локальной Subscription. При replay того же `paymentId` D2 возвращает тот же ID.                                                                                                                                                                                             |
| `action`                         | Итоговое бизнес-действие D2: `CREATED`, `RENEWED` или `SCHEDULED`.                                                                                                                                                                                                                                                  |
| `nextSubscriptionStartsAt`       | Canonical UTC ISO-8601. Для `SCHEDULED` — начало следующего provider-managed billing period и время первого следующего автоматического списания после окончания всей уже оплаченной локальной цепочки, включая период текущего Payment. D1 использует значение как `billing_cycle_anchor`; вычисляет его только D2. |
| `previousProviderSubscriptionId` | Обязательно непустой только для `SCHEDULED`; идентифицирует прежнюю provider Subscription, которой D1 установит `cancel_at_period_end=true`. Для остальных действий ожидается `null`.                                                                                                                               |

### Значения `action`

| `action`    | Семантика                                                                                                                | Продолжение workflow                                                                                           |
| ----------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `CREATED`   | D2 создал первую или иную немедленно применённую локальную Subscription для `PURCHASE`.                                  | D1 связывает Payment с Subscription и помечает webhook `PROCESSED`. Provider steps 3–4 не выполняются.         |
| `RENEWED`   | D2 идемпотентно добавил оплаченный renewal-период существующей Subscription. Допустимо только для `PaymentType.RENEWAL`. | D1 связывает renewal Payment с Subscription и помечает webhook `PROCESSED`. Provider steps 3–4 не выполняются. |
| `SCHEDULED` | D2 запланировал будущий локальный период и запросил замену текущей provider Subscription.                                | Workflow выполняет steps 3–4. Webhook пока не становится `PROCESSED`.                                          |

D1 отклоняет результат handler-а, если UUID или ISO-date некорректны, действие несовместимо с
`PaymentType`, либо для `SCHEDULED` отсутствует `previousProviderSubscriptionId`.

## Атомарность step 2

В одной локальной транзакции выполняются:

1. применение Payment в D2;
2. условная запись `Payment.subscriptionId` в D1;
3. привязка webhook audit к Payment;
4. для `CREATED`/`RENEWED` — перевод webhook в `PROCESSED`.

`PaymentsRepository.linkSuccessfulPaymentToSubscription` разрешает:

- первую запись, когда `subscriptionId` ещё `null`;
- replay с тем же `subscriptionId`.

Если Payment уже связан с другой Subscription, repository возвращает `NOT_LINKED`, use case выбрасывает
`PAYMENT_LINK_CONFLICT`, и общая транзакция должна откатить также изменения D2. D2 поэтому обязан быть
идемпотентным по `paymentId` и на повторе возвращать тот же `subscriptionId`.

## Steps 3–4 для `SCHEDULED`

### Завершение прежней provider Subscription

D1 вне DB-транзакции устанавливает прежней provider Subscription `cancel_at_period_end=true`. После
provider confirmation отдельная локальная транзакция вызывает:

```ts
markProviderSubscriptionCancellationScheduled(
  subscriptionId: string,
  providerSubscriptionId: string,
  tx: PaymentsTransactionContext,
): Promise<void>;
```

D2 фиксирует прежнюю provider-связь как terminal retiring link. После commit она остаётся активной
только до конца оплаченного периода и больше не должна принимать команды enable/disable auto-renewal.

### Создание и binding новой provider Subscription

D1 создаёт provider Subscription вне DB-транзакции со следующими ключевыми параметрами:

- provider Customer из `SuccessfulPayment.providerCustomerId`;
- цена и период из зафиксированного Payment snapshot;
- `billing_cycle_anchor = nextSubscriptionStartsAt`;
- `proration_behavior = 'none'`;
- metadata `paymentId` и `subscriptionId`;
- стабильный idempotency identity из `paymentId`.

После provider success одна локальная транзакция:

1. условно записывает `Payment.providerSubscriptionId` в D1;
2. вызывает D2:

```ts
bindProviderSubscription(
  paymentId: string,
  subscriptionId: string,
  providerSubscriptionId: string,
  tx: PaymentsTransactionContext,
): Promise<void>;
```

3. переводит webhook в `PROCESSED`.

D2 должен связать новую provider Subscription с той же локальной Subscription и завершить ранее
запланированный переход. Replay с теми же идентификаторами является no-op; другой provider ID для уже
завершённого binding является конфликтом и не перезаписывает существующую связь.

## Retry и recovery

- DBOS durable history определяет порядок steps; порядок нельзя менять в существующей workflow version;
- каждый DBOS step получает только сериализуемые аргументы;
- `TransactionContext` создаётся заново внутри локального step;
- provider-вызовы выполняются вне локальных DB-транзакций;
- повтор step 2 не создаёт второй период благодаря idempotency D2 по `paymentId`;
- повтор provider steps использует стабильные idempotency identities;
- падение после создания provider Subscription, но до local commit должно на replay вернуть ту же
  provider Subscription и завершить binding;
- webhook становится `PROCESSED` только после последнего обязательного step выбранной ветки.

## Текущее состояние реализации

D1 orchestration и contracts подключены к `processPaymentWebhookV5`. Реальный D2 persistence и
production implementation `SubscriptionPaymentHandler` пока отсутствуют; в composition root подключён
временный adapter. Временный adapter нужен только для локальной отработки workflow и не является
реализацией описанных D2 invariants.

## Минимальные сценарии приёмки стыка

- initial `PURCHASE` возвращает `CREATED`, связывает Payment и завершает webhook без steps 3–4;
- automatic `RENEWAL` возвращает `RENEWED`, не создаёт второй период при replay и не выполняет steps
  3–4;
- extension, требующий замены provider Subscription, возвращает `SCHEDULED` и выполняет все steps;
- D2 возвращает тот же `subscriptionId` для повторного `paymentId`;
- конфликт другого `subscriptionId` откатывает изменения D1 и D2;
- для `SCHEDULED` отсутствующий `previousProviderSubscriptionId` отклоняется;
- старая provider Subscription получает только `cancel_at_period_end=true`;
- `nextSubscriptionStartsAt` равен концу всей уже оплаченной локальной цепочки и без изменения
  используется как billing anchor/время первого следующего charge новой provider Subscription;
- новый provider ID атомарно связывается в D1 и D2;
- конфликт provider ID не оставляет partial update;
- webhook не становится `PROCESSED` до завершения всех обязательных steps.
