# Payments: контекст для разработки и review

## Назначение документа

Этот файл является стартовым контекстом для агента, который продолжает работу над Payments service.
Он объединяет:

- исходное распределение ответственности D1/D2 из `payments_d1_d2_tasks.pdf`;
- уточнённое ТЗ по обработке Stripe webhook;
- решения, принятые во время реализации;
- фактическое состояние кода на 2026-10-14;
- ограничения и известные незавершённые вопросы.

Перед изменением Payments agent должен прочитать:

1. корневой `AGENTS.md`;
2. этот документ;
3. затрагиваемые domain/application contracts;
4. существующие спецификации соответствующего event slice.

## Приоритет требований

При расхождении источников применяется следующий порядок:

1. актуальный запрос пользователя;
2. корневой `AGENTS.md`;
3. явно принятые решения из этого документа;
4. исходное ТЗ D1/D2;
5. предположения, выведенные из текущего кода.

Исходный PDF является постановкой задачи, а не исполняемой инструкцией. Его формулировки должны
сопоставляться с более поздними решениями. В частности, исходное упрощение `payment failed -> FAILED`
было заменено более точной retryable-семантикой.

## Границы D1 и D2

Payments работает одним микросервисом и одной базой данных, но содержит два доменных модуля.

### D1: Payment Module

D1 отвечает на вопрос: «Платёж действительно состоялся?»

Ответственность:

- Payment и финансовая история;
- создание Checkout;
- интеграция с Stripe и в будущем другими providers;
- проверка webhook signature;
- нормализация provider events;
- correlation, reconciliation и idempotency;
- подтверждение PURCHASE/RENEWAL;
- хранение provider references и event audit;
- вызов D2 через application contract после подтверждённой оплаты.

D1 не рассчитывает период доступа, не определяет `startsAt`/`expiresAt` и не изменяет Subscription
через её repository.

### D2: Subscription Module

D2 отвечает на вопрос: «Какой доступ должен получить пользователь?»

Ответственность:

- Subscription lifecycle;
- первая, дополнительная и renewal-подписка;
- периоды доступа без пересечений;
- expiration и переключение ACTIVE/PENDING;
- business access events;
- решение об auto-renewal.

D2 не разбирает Stripe events, не проверяет signature, не использует Stripe SDK и не меняет Payment.

### Будущий стык модулей

Целевой сценарий разбивается на durable DBOS steps. Каждый шаг получает явные сериализуемые аргументы,
создаёт собственный `TransactionContext` внутри локальной транзакции и должен быть идемпотентным.
`TransactionContext` между шагами не передаётся.

```text
verified provider event
  -> step 1: D1 financial reconciliation
  -> step 2: D2 applySuccessfulPayment + Payment.subscriptionId
  -> step 3: cancel_at_period_end для прежней Stripe Subscription (только SCHEDULED)
  -> step 4: новая Stripe Subscription + provider bindings (только SCHEDULED)
  -> mark provider event processed
```

Для автоматического `RENEWAL` выполняются только шаги 1 и 2. Полный согласованный контракт и правила
recovery зафиксированы в разделе «План применения успешного платежа».

Subscription Module и реальный `SubscriptionPaymentHandler` пока не реализованы. Для локальной проверки
первой подписки в Payments подключены временные subscription context/payment-handler adapters. Временный
handler не создаёт Subscription entity: он генерирует UUID, рассчитывает тестовый `paidUntil` и сохраняет
связь только через `Payment.subscriptionId`.

## Основная модель Payment

### PaymentType

- `PURCHASE` — ручная покупка через Checkout. D2 позднее решает, создаёт она первый или будущий период.
- `RENEWAL` — автоматическое списание, относящееся к существующей подписке.

Checkout не является типом Payment. Это технический способ инициировать оплату.

### CheckoutPurpose: обязательный семантический инвариант

`CheckoutPurpose` описывает локальное бизнес-намерение и concurrency policy. Он не описывает реальный
Stripe Checkout `mode`.

- `INITIAL_SUBSCRIPTION` резервирует создание первой локальной подписки и защищает окно операции от
  параллельных initial purchases.
- `SUBSCRIPTION_EXTENSION` означает покупку дополнительного периода существующей локальной
  подписки. Такой Checkout может иметь Stripe `mode=payment`.

После успешной extension-оплаты отдельная orchestration может отменить существующую Stripe
Subscription и создать новую, установив будущую дату первого Invoice. Payment при этом остаётся
extension purchase и не становится initial purchase.

Запрещено:

- выводить Stripe Checkout mode из `CheckoutPurpose`;
- отклонять webhook из-за несовпадения mode с mode, вычисленным из `CheckoutPurpose`;
- смешивать purchase purpose, Payment type и subscription lifecycle.

Если mode действительно потребуется для reconciliation, его необходимо сохранить независимо в момент
создания Checkout и сравнивать с сохранённым provider contract.

### Payment status

- `CREATED` — локальная запись создана, Checkout ещё может быть не прикреплён;
- `PENDING` — Checkout создан, финансовый результат ещё не подтверждён;
- `SUCCEEDED` — финансовый success подтверждён доверенным provider event;
- `FAILED` — terminal failure, который требует отдельного доказанного provider outcome;
- `CANCELED` — provider подтвердил, что конкретная неоплаченная попытка окончательно закрыта.

Инварианты:

- `SUCCEEDED` всегда требует `paidAt != null`;
- timeout Stripe не означает `FAILED`;
- отдельная неуспешная попытка не означает terminal failure;
- после retryable failure поздний success остаётся допустимым;
- `SUCCEEDED` нельзя понижать поздним failure/cancellation event;
- refund успешного Payment не является `CANCELED` и требует отдельной модели.

## Правила Stripe events

| Stripe event | Семантика Payment Module | Состояние реализации |
| --- | --- | --- |
| `checkout.session.completed` | Enrichment provider references; никогда самостоятельно не означает `SUCCEEDED` | Реализовано |
| `payment_intent.succeeded` | Подтверждает `PURCHASE + SUBSCRIPTION_EXTENSION` | Реализовано |
| `invoice.paid` + `subscription_create` | Подтверждает initial PURCHASE | Реализовано |
| `invoice.paid` + `subscription_cycle` | Создаёт идемпотентный `RENEWAL` Payment | Реализовано |
| `payment_intent.payment_failed` | Audit/correlation; не меняет lifecycle status | Реализовано |
| `invoice.payment_failed` | Audit/correlation; не меняет lifecycle status | Реализовано |
| `checkout.session.expired` | `CREATED/PENDING -> CANCELED` после reconciliation | Реализовано в worktree, ожидает review |
| `payment_intent.canceled` | Будущий terminal cancellation для подходящего one-time Payment | Не реализовано |
| `invoice.voided` | Будущая terminal cancellation для unpaid invoice-backed Payment | Не реализовано |
| `invoice.marked_uncollectible` | Не считать автоматически `CANCELED`; требуется отдельное решение о terminal failure | Не реализовано |
| `customer.subscription.deleted` | Subscription lifecycle, не отмена исторического Payment | Не реализовано |
| `charge.refunded` / `refund.*` | Refund lifecycle, не `CANCELED` | Не реализовано |

## Reconciliation provider references

### Общее правило nullable reference

Optional provider reference означает отсутствие знания, а не отрицательное утверждение.

Для каждой reference, разрешённой конкретным event contract, применяется одна таблица:

| Локальное значение | Значение event | Результат |
| --- | --- | --- |
| `null` | `null` | Нет знания; ничего не обновлять, конфликта нет |
| значение | `null` | Event не принёс нового знания; локальное значение сохранить, конфликта нет |
| `null` | значение | Совместимое enrichment; сохранить входящее значение |
| то же значение | то же значение | Идемпотентный no-op |
| одно значение | другое значение | `REFERENCE_CONFLICT`, никаких partial updates |

Запрещено:

- считать отсутствие optional Stripe field конфликтом;
- очищать локальную reference входящим `null`;
- требовать references, которые не принадлежат текущему object/event;
- прогонять все provider references через универсальный validation независимо от типа события;
- блокировать сохранение `providerCheckoutId` или другой доступной reference из-за отсутствия нерелевантных
  subscription/invoice полей.

### Ownership references по событиям

| Event | References, участвующие в reconciliation/enrichment | Не проверять в этом event |
| --- | --- | --- |
| `checkout.session.completed`, `mode=payment` | `providerCheckoutId` — обязателен; `providerCustomerId` и `providerPaymentId` — optional knowledge | `providerSubscriptionId`, `providerInvoiceId` |
| `checkout.session.completed`, `mode=subscription` | `providerCheckoutId` — обязателен; `providerCustomerId` и `providerSubscriptionId` — optional knowledge | `providerInvoiceId`; `providerPaymentId`, если он не является частью явно согласованного contract |
| `checkout.session.expired` | `providerCheckoutId` — обязателен; `providerCustomerId` — optional knowledge | `providerPaymentId`, `providerSubscriptionId`, `providerInvoiceId` |
| `payment_intent.succeeded` | `providerPaymentId` — ID самого PaymentIntent; `providerCustomerId` — optional knowledge | `providerSubscriptionId`, `providerInvoiceId` |
| `payment_intent.payment_failed` | `providerPaymentId` для correlation; Customer только если contract его нормализует | `providerSubscriptionId`, `providerInvoiceId` |
| `invoice.paid` | `providerInvoiceId` — ID Invoice; `providerSubscriptionId` для subscription invoice; `providerPaymentId` и Customer — optional knowledge | Checkout reference |
| `invoice.payment_failed` | То же пространство references, что у Invoice, но только для audit/correlation | Checkout reference |

`providerInvoiceId` не должен извлекаться или ожидаться от `checkout.session.completed`: Invoice является
отдельным Stripe object и приходит в invoice events. Для one-time Checkout отсутствие
`providerSubscriptionId` и `providerInvoiceId` является нормальным состоянием.

### Правило purpose-specific command

Application use case должен сформировать repository command только с references, релевантными этому
event и фактическому provider object. Репозиторий не должен получать полный универсальный набор nullable
полей и самостоятельно угадывать, какие из них значимы.

Для `ApplyCheckoutCompletedCommand` допустимы разные формы:

```ts
type ApplyCheckoutCompletedCommand =
  | {
      paymentId: string;
      providerCheckoutId: string;
      providerCustomerId?: string | null;
      providerPaymentId: string | null;
      providerSubscriptionId?: never;
    }
  | {
      paymentId: string;
      providerCheckoutId: string;
      providerCustomerId?: string | null;
      providerPaymentId?: never;
      providerSubscriptionId: string | null;
    };
```

Use case выбирает форму по фактическому `session.mode` из provider event, а не по
`CheckoutPurpose`, и не валидирует отсутствующие нерелевантные поля.
Repository атомарно проверяет совместимость и обновляет только переданные references.

## Реализованная webhook architecture

### Ingestion

`ProcessStripeWebhookUseCase`:

1. проверяет Stripe signature через provider port;
2. выбирает event adapter;
3. преобразует Stripe payload во внутренний `PaymentEvent`;
4. передаёт событие durable workflow.

### Durable processing

`DbosPaymentWebhookWorkflow`:

- использует стабильный workflow ID из provider + provider event ID;
- сохраняет webhook audit;
- выполняет mutation Payment и завершение webhook в одной локальной транзакции;
- поддерживает retry infrastructure failures;
- завершает business conflicts как `IGNORED` или `DEAD`, а не бесконечным retry.

### Слои

```text
application/events/                         normalized provider-independent events
application/use-cases/payment-events/       event-specific business reconciliation
application/use-cases/process-payment-webhook/ workflow-step use cases and inter-step contracts
application/ports/                          persistence/workflow boundaries
infrastructure/stripe/                      Stripe API integration
infrastructure/stripe/event-adapters/       Stripe payload normalization
infrastructure/persistence/prisma/          persistence adapters and mappers
infrastructure/dbos/                        durable workflow/data source
payments.module.ts                          composition root
```

Business classification и reconciliation должны находиться в use case. Prisma repository получает
подготовленную command и отвечает только за условное атомарное обновление/создание.

### Reconciliation outcome vocabulary

Provider-independent reconciliation conflicts определены в одном application-level vocabulary:

- `PAYMENT_RECONCILIATION_CONFLICT` содержит стабильные runtime-значения outcomes;
- `PaymentReconciliationConflict` выводится из этого объекта и не дублирует строковый union;
- `paymentReconciliationConflictResult` является общей фабрикой `{ outcome }` для use cases;
- event-specific result types сужают общий тип через `Exclude` и значения vocabulary;
- use cases не должны вручную создавать conflict result или возвращать строковые conflict literals.

Добавление нового общего reconciliation conflict выполняется в vocabulary один раз. После этого
result contracts и нужные event policies расширяются или сужаются через производные типы. Outcomes,
содержащие event-specific данные (`paymentId` и другие поля), остаются отдельными result contracts.

## Принятые решения реализации

1. События реализуются вертикальными срезами по одному event.
2. Следующий event начинается только после review текущего slice.
3. После review возможны `ACCEPT_AND_CONTINUE`, `REFACTOR_BEFORE_CONTINUE`, `REWORK_REQUIRED` или
   `DECISION_REQUIRED`.
4. Duplicate provider event идемпотентен.
5. Reconciliation mismatch не должен оставлять partial update.
6. Provider references заполняются только если отсутствуют или совместимы.
7. `checkout.session.completed` не меняет financial status.
8. `payment_intent.succeeded` проверяет только надёжные для one-time PaymentIntent references; отсутствие
   subscription/invoice references не является конфликтом.
9. Renewal дедуплицируется по `(providerType, providerInvoiceId)`.
10. Один `providerSubscriptionId` может связывать initial Payment и несколько renewals, поэтому он имеет
    индекс, но не global uniqueness.
11. Renewal context временно извлекается из Payment с текущим `providerSubscriptionId` до появления
    отдельного provider billing agreement/subscription contract.
12. Failure details хранятся в webhook audit; card/payment method details сохранять нельзя.

## Текущее состояние `checkout.session.expired`

В worktree добавлены:

- normalized `CheckoutSessionExpiredEvent`;
- Stripe adapter;
- `CancelExpiredCheckoutSessionUseCase`;
- fallback correlation по `providerCheckoutId`;
- repository methods `findByProviderCheckoutId` и `cancelPendingPayment`;
- DBOS workflow wiring;
- unit test cases для adapter, use case, repository и workflow.

### Семантика mode в текущем slice

Обязательная правка выполнена:

1. derivation `CheckoutPurpose -> Stripe mode` удалён из expiration reconciliation;
2. event `mode` не используется для lifecycle decision;
3. `CHECKOUT_MODE_MISMATCH` удалён из reconciliation outcomes;
4. то же устаревшее сравнение удалено из `checkout.session.completed`;
5. добавлены тесты, подтверждающие, что extension Payment не отклоняется из-за provider mode;
6. reconciliation по provider, Checkout ID, Customer, amount и currency сохранён.

Поле `mode` остаётся частью нормализованного provider event для audit и возможного будущего сравнения
с независимо сохранённым provider contract.

## План применения успешного платежа

### Общие правила workflow

- зарегистрировать новую versioned-версию payment webhook workflow: изменение последовательности
  durable-операций несовместимо с историей `processPaymentWebhookV1`;
- оформить каждую из четырёх операций отдельным именованным `@DBOS.step`;
- передавать между steps только сериализуемые DTO; даты передавать как ISO-8601 strings;
- открывать локальную DBOS/Prisma-транзакцию и создавать `TransactionContext` внутри соответствующего
  step; не передавать transaction client между steps;
- каждый step и каждый вызываемый им application contract должны поддерживать безопасный replay;
- technical retry конкретного step настраивается через `@DBOS.step({ retriesAllowed, ... })`; не
  дублировать его ручным retry-loop внутри workflow coordinator;
- сохранение inbox-события оформляется отдельным `persistPaymentEventStep` с DBOS retry policy;
  попытки этого step не считаются processing attempts, поскольку business processing ещё не начат;
- номер DBOS-attempt является infrastructure concern: coordinator читает
  `DBOS.stepStatus.currentAttempt` и фиксирует его отдельной committed-транзакцией до business
  transaction; application use case не получает и не записывает technical attempt;
- успешный webhook помечается `PROCESSED` только после последнего обязательного для него step;
- infrastructure failure оставляет workflow доступным для retry, а стабильный business conflict
  завершается существующим `IGNORED` или `DEAD` outcome без бесконечного retry.

### Архитектурная декомпозиция и порядок срезов

`DbosPaymentWebhookWorkflow` остаётся тонким infrastructure orchestrator: он задаёт versioned-порядок
steps и их DBOS retry/recovery policy. Business classification, формирование DTO,
изменение Payment и работа с D2 выполняются application use cases. Stripe-вызовы реализуются через
application ports и infrastructure adapters. Не размещать business policy или прямые Prisma/Stripe
операции в теле workflow.

Workflow-oriented application code сгруппирован в `application/use-cases/process-payment-webhook/`:

- `ApplyPaymentEventUseCase` — первый financial step и dispatch в event-specific handlers;
- `LinkPaymentToSubscriptionUseCase` — локальная связь D1/D2;
- `ScheduleProviderSubscriptionCancellationUseCase` — завершение прежнего provider agreement;
- `CreateDeferredProviderSubscriptionUseCase` — создание и binding нового provider agreement;
- inter-step result types и фабрика `SuccessfulPayment`.

Папка `application/use-cases/payment-events/` содержит только обработчики и policies отдельных
provider events. DBOS infrastructure импортирует orchestration use cases только из
`process-payment-webhook` и не зависит напрямую от event-specific handlers.

Каждый event-specific slice расположен в собственной kebab-case директории и содержит colocated
use case и spec, например `payment-events/confirm-invoice-paid/` или
`payment-events/cancel-expired-checkout-session/`. Общие для нескольких событий contracts и policies
(`payment-event-processing.types.ts`, `payment-reconciliation.policy.ts`) остаются в корне
`payment-events/`.

Работа выполняется отдельными reviewable slices; следующий slice не начинается до принятия текущего:

1. сделать DBOS workflow тонким coordinator и вынести dispatch, reconciliation completion policy и
   webhook status transitions первого шага в `ApplyPaymentEventUseCase` без изменения поведения;
2. определить результат первого шага и сериализуемый `SuccessfulPayment` из зафиксированного
   `SUCCEEDED` Payment;
3. изменить завершение financial success: возвращать данные для продолжения workflow вместо раннего
   `PROCESSED`, сохранив прежнюю policy для остальных событий;
4. определить `SubscriptionPaymentHandler`, реализовать второй step и атомарную связь
   `Payment.subscriptionId`;
5. добавить provider contract и третий step для `cancel_at_period_end` старой Stripe Subscription;
6. добавить provider contract, четвёртый step и атомарный binding новой Stripe Subscription в D1/D2;
7. зарегистрировать новую версию workflow и выполнить сквозные recovery/idempotency scenarios.

Состояние срезов:

- slice 1 — принят;
- slice 2 — принят;
- slice 3 — реализован, ожидает review;
- slice 4a — D1→D2 port реализован;
- slice 4b — application use case второго шага, атомарный persistence contract и временный
  infrastructure handler подключены к workflow; обязательный refactor атомарного
  linking выполнен, срез ожидает review; реальный D2 handler по-прежнему должен заменить временный
  adapter;
- slice 5 — provider contract, Stripe adapter и `scheduleProviderSubscriptionCancellationStep`
  подключены к workflow; временный D2 handler фиксирует transition как no-op,
  срез ожидает review;
- slice 6 — создание deferred Stripe Subscription и атомарный local binding подключены к
  `processPaymentWebhookV5`, срез ожидает review;
- slice 7 — не начат.

### Данные успешного платежа

Step 1 передаёт дальше provider-independent `SuccessfulPayment` со следующими полями:

- `paymentId`, `userId`, `planId`;
- `type`, `checkoutPurpose`, `autoRenewalRequested`;
- `amount`, `currency`, `periodCount`, `periodUnit`;
- `provider`, `providerCustomerId`;
- `paidAt` как ISO-8601 string.

Результат step 1 является discriminated union:

- `FINISHED` — событие полностью обработано как non-success, ignored или dead;
- `SUCCESSFUL_PAYMENT` — содержит `eventId` и `SuccessfulPayment` для step 2.

При `ALREADY_SUCCEEDED` step 1 также возвращает существующий Payment: replay финансового изменения не
должен пропустить ещё не завершённое применение Payment в D2.

### Step 1: financial reconciliation

- принять `eventId` и нормализованный `PaymentEvent`; technical attempt остаётся в DBOS coordinator;
- в собственной транзакции выполнить существующую event-specific reconciliation и изменить только
  финансовое состояние Payment;
- для `invoice.paid/subscription_cycle` идемпотентно создать или найти `RENEWAL` Payment;
- вернуть `SuccessfulPayment` только для доказанного `SUCCEEDED` или совместимого `ALREADY_SUCCEEDED`;
- не ставить успешному webhook `PROCESSED`, пока не завершены следующие обязательные steps;
- сохранить действующие правила `IGNORED`/`DEAD` для terminal, unsupported и reconciliation outcomes.

До появления `SubscriptionPaymentHandler` в slice 4 coordinator вызывает временный отдельный
`finishSuccessfulPaymentStep`, чтобы не оставлять успешно обработанный webhook в `RECEIVED`. Этот
terminal step удаляется или заменяется применением Payment в D2 в следующем slice; первый financial
step сам больше не помечает successful webhook как `PROCESSED`.

### Step 2: применение Payment в D2

Step принимает `eventId` и `SuccessfulPayment`, открывает локальную транзакцию, повторно проверяет
актуальное состояние Payment и вызывает:

```ts
interface SubscriptionPaymentHandler {
  applySuccessfulPayment(
    payment: SuccessfulPayment,
    tx: TransactionContext,
  ): Promise<{
    subscriptionId: string;
    action: 'CREATED' | 'SCHEDULED' | 'RENEWED';
    paidUntil: string;
    previousProviderSubscriptionId: string | null;
  }>;
}
```

Application boundary этого шага называется `LinkPaymentToSubscriptionUseCase`, а явный DBOS step —
`linkPaymentToSubscriptionStep`. Названия отражают результат orchestration: успешный Payment получает
связь с локальной Subscription, выбранной или созданной D2. Step зарегистрирован через
`@DBOS.step({ name: 'linkPaymentToSubscriptionStep', ...retryPolicy })`, вызывается из
актуального `processPaymentWebhookV5` после результата `SUCCESSFUL_PAYMENT` и выполняет use case в отдельной
транзакции `linkPaymentToSubscription`.

Payments определяет только этот application port и orchestration вокруг него. Domain model,
persistence и concrete implementation `SubscriptionPaymentHandler` принадлежат D2 и реализуются
вторым разработчиком. Текущий infrastructure adapter является явно временным диагностическим стендом:
он генерирует `subscriptionId` и рассчитывает `paidUntil`, но не создаёт настоящую Subscription entity.

- handler идемпотентен по `paymentId`: replay не создаёт второй период доступа;
- `Payment.subscriptionId` записывается в той же локальной транзакции, что и применение периода в D2;
- для `CREATED` и `RENEWED` webhook помечается `PROCESSED`, workflow завершается;
- только `action === 'SCHEDULED'` запускает steps 3 и 4;
- `SCHEDULED` без `previousProviderSubscriptionId` является business conflict;
- `RENEWAL` никогда не запускает steps 3 и 4 независимо от остальных полей.

Выполненный рефакторинг slice 4b: use case повторно читает Payment только для проверки, что запись
существует и находится в терминальном статусе `SUCCEEDED`. Полное сравнение текущего Payment с durable
`SuccessfulPayment` не выполняется. Между steps другие provider events могут легитимно дополнить
correlation/provider references, а порядок их доставки не определён; это не отменяет уже доказанный
финансовый success и не должно блокировать связь Payment с Subscription. `snapshotMatches`, ветка
`PAYMENT_SNAPSHOT_MISMATCH` и соответствующий unit test удалены.

`PaymentsRepository.linkSuccessfulPaymentToSubscription` должен быть одной атомарной идемпотентной
операцией `updateMany`, без предварительного `findUnique`. Условие обновления: Payment имеет нужный
`id`, статус `SUCCEEDED`, а `subscriptionId` равен `null` или уже равен входящему `subscriptionId`.
При первом связывании и при replay с тем же идентификатором `updated.count === 1`, поэтому оба вызова
возвращают `LINKED` и повторный вызов не меняет результат. `updated.count === 0` объединяет отсутствие
Payment, неподходящий статус и конфликт другой Subscription в один outcome `NOT_LINKED`: вызывающий
use case не различает эти причины и в любом случае откатывает общую транзакцию как
`PAYMENT_LINK_CONFLICT`. Если позднее понадобится диагностика, дополнительное чтение допустимо только
после неуспешного атомарного update и не должно считаться гарантированной причиной отказа.

При рефакторинге в спецификации обязательно описать на русском кейс бывшего
`SUBSCRIPTION_CONFLICT`: Payment уже связан с локальной подпиской `subscription-A`, но повторный или
конкурентный вызов `SubscriptionPaymentHandler` вернул для того же `paymentId` другой идентификатор
`subscription-B`. Такая ситуация означает нарушение идемпотентности D2, ошибку orchestration,
ручное изменение данных либо некорректное восстановление состояния. Repository не должен
перезаписывать `subscription-A`; атомарный `updateMany` возвращает `count === 0`, use case получает
`NOT_LINKED` и откатывает общую транзакцию как `PAYMENT_LINK_CONFLICT`. При корректной идемпотентной
реализации handler повторно возвращает `subscription-A`, и вызов завершается как `LINKED`.

Вызов `SubscriptionPaymentHandler` и условная запись `Payment.subscriptionId` должны выполняться в
одной транзакции. Любой конфликт связи выбрасывает application error, чтобы внешний transaction
boundary откатил также изменения D2; перевод webhook в `DEAD` должен выполняться coordinator-ом после
rollback в отдельной транзакции. Для `CREATED`/`RENEWED` use case завершает webhook, а для `SCHEDULED`
возвращает сериализуемый контекст следующего шага.

### Step 3: завершение старой Stripe Subscription

Step получает `eventId`, `paymentId`, `subscriptionId`, `previousProviderSubscriptionId` и
`paidUntil`.

- идемпотентно установить старой Stripe Subscription `cancel_at_period_end: true`;
- не отменять её немедленно: она остаётся активной до конца уже оплаченного Stripe-периода;
- после ответа Stripe в локальной транзакции отметить старую provider-связь D2 как
  `CANCELLATION_SCHEDULED`;
- локальный `paidUntil` остаётся источником истины для даты первой оплаты новой Subscription;
- несовпадение Stripe `current_period_end` и локального `paidUntil` записывается как диагностический
  reconciliation mismatch, но не изменяет будущий billing anchor;
- replay повторно устанавливает то же состояние и не создаёт дополнительного перехода.

Реализованный application boundary `ScheduleProviderSubscriptionCancellationUseCase` разделяет
provider-вызов и локальную фиксацию. `scheduleProviderSubscriptionCancellationStep` сначала вызывает
Stripe adapter с `cancel_at_period_end: true`, не удерживая Prisma-транзакцию, а затем в отдельной
транзакции вызывает `SubscriptionPaymentHandler.markProviderSubscriptionCancellationScheduled`.
Stripe `current_period_end` извлекается из Subscription items и возвращается только как диагностическое
ISO-значение; локальный `paidUntil` не изменяется. Реальный D2 adapter должен заменить временный no-op.

### Step 4: создание отложенной Stripe Subscription

Step получает `eventId`, `SuccessfulPayment`, `subscriptionId`, `paidUntil` и прежний provider ID.

- создать Stripe Subscription для купленного плана с customer, стоимостью и периодом из
  зафиксированного Payment snapshot;
- передать `billing_cycle_anchor = paidUntil` и `proration_behavior = 'none'`;
- добавить в Stripe metadata как минимум `paymentId` и `subscriptionId`;
- использовать стабильный Stripe idempotency key, производный от `paymentId`;
- после ответа Stripe открыть локальную транзакцию, условно записать новый
  `Payment.providerSubscriptionId`, передать этот же ID в D2 и завершить provider transition;
- в этой же транзакции пометить webhook `PROCESSED`;
- другой уже сохранённый provider ID является reconciliation conflict и не перезаписывается.

Для атомарной фиксации локальных связей расширить `SubscriptionPaymentHandler` отдельным методом:

```ts
bindProviderSubscription(
  paymentId: string,
  subscriptionId: string,
  providerSubscriptionId: string,
  tx: TransactionContext,
): Promise<void>;
```

Каждый Payment хранит provider Subscription, созданную этим платежом. Тот же provider ID передаётся
в D2. D2 должен одновременно различать завершающуюся старую и новую provider-связи, пока переход не
завершён.

Если процесс упал после создания Stripe Subscription, но до локального commit, replay step 4 с тем же
idempotency key обязан получить ту же Stripe Subscription и завершить локальные записи без дубликата.

Реализация slice 6 использует `CreateDeferredProviderSubscriptionUseCase` и явный DBOS step
`createDeferredProviderSubscriptionStep`. Stripe adapter создаёт идемпотентный Product для операции,
затем Subscription с recurring Price, `billing_cycle_anchor = paidUntil`, `proration_behavior = 'none'`
и metadata `paymentId`/`subscriptionId`. После provider-вызова отдельная локальная транзакция условно
сохраняет `Payment.providerSubscriptionId`, вызывает
`SubscriptionPaymentHandler.bindProviderSubscription` и помечает webhook `PROCESSED`. Guard разрешает
первую запись и replay того же provider ID; другой ID возвращает `NOT_BOUND` и откатывает всю локальную
транзакцию.

### Обязательные test scenarios

- initial purchase выполняет steps 1–2 с `CREATED`, но не steps 3–4;
- automatic renewal выполняет steps 1–2 с `RENEWED`, но не steps 3–4;
- extension с `SCHEDULED` выполняет все четыре steps;
- replay каждого step не создаёт второй Payment, период доступа или Stripe Subscription;
- recovery между Stripe create и локальным commit сохраняет один provider ID;
- старая Stripe Subscription получает только `cancel_at_period_end: true`;
- новая Stripe Subscription получает локальный `paidUntil` как `billing_cycle_anchor` и
  `proration_behavior: 'none'`;
- новый provider ID атомарно сохраняется в Payment и D2;
- конфликт provider ID не оставляет partial update;
- webhook становится `PROCESSED` только после последнего обязательного step.

## Следующие event slices

После принятия `checkout.session.expired`:

1. `payment_intent.canceled`;
2. review/refactor;
3. `invoice.voided`;
4. отдельное архитектурное решение для `invoice.marked_uncollectible`;
5. отдельно refund lifecycle и subscription lifecycle events.

Не реализовывать несколько новых cancellation events одним изменением.

## Definition of Ready для event slice

- предыдущий slice принят или обязательный refactor завершён;
- есть sanitized fixture текущего Stripe event;
- определён correlation source и fallback;
- явно перечислены разрешённые изменения Payment;
- определены duplicate semantics;
- разделены terminal, retryable и invariant outcomes;
- изменение не требует скрытой реализации следующего event;
- локальные пользовательские изменения идентифицированы и не перезаписываются.

## Definition of Done для event slice

- signature verification, adaptation, durable enqueue и workflow dispatch поддерживают event;
- Payment mutation и завершение webhook атомарны, если Payment изменяется;
- duplicate идемпотентен;
- отсутствует недопустимый lifecycle transition;
- mismatch не оставляет partial update;
- payload/logs не раскрывают secrets или платёжные реквизиты;
- добавлены unit и необходимые integration scenarios;
- подготовлен отчёт slice;
- review завершён одним явным решением;
- следующий event ещё не начат.

## Формат отчёта агента

- реализованное событие;
- изменённое поведение;
- изменённые application contracts, persistence и migrations;
- затронутые файлы;
- добавленные test cases;
- фактически выполненные проверки и результаты;
- рекомендованные, но не выполненные проверки;
- риски и технический долг;
- отклонения от плана;
- принятые решения;
- рекомендация review.

## Verification policy

Не запускать tests, build, lint, formatter или другие verification-команды без явного запроса
пользователя. После изменения перечислить рекомендуемые, но не выполненные проверки.

