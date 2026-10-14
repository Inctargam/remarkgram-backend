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

Целевой сценарий должен атомарно применить подтверждённый Payment в D2 и связать результат с Payment:

```text
verified provider event
  -> D1 reconciliation
  -> shared transaction
       -> D2 applySuccessfulPayment
       -> D1 mark Payment SUCCEEDED, set paidAt and subscriptionId
       -> mark provider event processed
  -> COMMIT
```

Subscription Module и реальный `SubscriptionPaymentHandler` пока не реализованы. В Payments остаётся
временный subscription context adapter.

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
application/ports/                          persistence/workflow boundaries
infrastructure/stripe/                      Stripe API integration
infrastructure/stripe/event-adapters/       Stripe payload normalization
infrastructure/persistence/prisma/          persistence adapters and mappers
infrastructure/dbos/                        durable workflow/data source
payments.module.ts                          composition root
```

Business classification и reconciliation должны находиться в use case. Prisma repository получает
подготовленную command и отвечает только за условное атомарное обновление/создание.

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

