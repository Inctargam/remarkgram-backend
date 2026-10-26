# Payments: контекст для разработки и review

## Актуальная регистрация workflow (2026-10-24)

Для локальной разработки оставлен единственный `DbosPaymentWebhookWorkflow.process`
с DBOS-именем `processPaymentWebhook`. Legacy `processV6` и используемые только им
transaction wrappers удалены. Упоминания V6/V7 и сохранения старых регистраций ниже
описывают историю решений; требование сохранять их отменено пользователем.
Application retry, provider steps и обработка ошибок текущего сценария сохранены.
Старые локальные DBOS execution histories не мигрируются и не удаляются автоматически.
Tests/build/lint/formatter не запускались; рекомендованы workflow/retry/error-policy
unit tests и проверка типов payments.

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

### Auto-renewal: D1 boundary

D1 предоставляет `SetProviderSubscriptionAutoRenewalUseCase` для изменения настройки recurring
billing существующей provider Subscription. Эта операция не принимает бизнес-решение об auto-renewal,
не хранит lifecycle локальной Subscription и не реализует переходные состояния другого модуля.

До появления реального D2 `PaymentsProviderSubscriptionAutoRenewalAdapter` зарегистрирован и
экспортирован из `PaymentsModule` по собственному class token. Будущий D2 должен объявить
`ProviderSubscriptionAutoRenewalGateway` в своём application-слое с отдельными методами `enable` и
`disable`, после чего composition root свяжет D2 token с этим адаптером. D2 не должен импортировать
`SetProviderSubscriptionAutoRenewalUseCase` напрямую.

```ts
type SetProviderSubscriptionAutoRenewalParams = {
  provider: PaymentProvider;
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
  autoRenewalChangeId: string;
};

type SetProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};
```

`autoRenewalChangeId` идентифицирует один запрос на изменение настройки auto-renewal и не меняется
при retry/replay этого запроса. Use case валидирует provider, передаёт `autoRenewalChangeId` и desired
state через `PaymentProviderPort.setSubscriptionAutoRenewal` и проверяет, что provider подтвердил
нужную Subscription и настройку. Итоговый idempotency key формирует concrete provider adapter. Для
Stripe `autoRenewalEnabled=false` преобразуется в
`cancel_at_period_end=true`, а `autoRenewalEnabled=true` — в `cancel_at_period_end=false`. Это не
немедленная отмена Subscription и не изменение исторического Payment.

Вызов provider выполняется без открытой DB-транзакции. Повтор операции с тем же
`autoRenewalChangeId` и
desired state безопасен. D1 не содержит gateway, persistence, worker/workflow или state machine другого
модуля; вызывающая сторона самостоятельно реализует координацию и retry поверх этой D1 capability.

D2 разрешает enable/disable auto-renewal только для provider Subscription, которая является текущей
управляемой связью локальной Subscription. После Step 3 прежняя provider Subscription переходит в
необратимое состояние завершения: она остаётся активной только до конца уже оплаченного периода, но
больше не может быть целью enable/disable. После Step 4 настройкой auto-renewal можно управлять только
у новой provider Subscription, когда она стала текущей согласно lifecycle D2. D1 capability не может
проверить это правило по одному provider ID; eligibility обязана быть проверена и зафиксирована D2 до
внешнего вызова.

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

### Модель D2: доступ и автопродление (2026-10-26)

В Prisma-схеме три модели: `Subscription`, `SubscriptionPaymentApplication` и `AutoRenewalOperation`.
Существующая миграция `20261021120000_add_subscriptions` обновлена на месте: она ещё не применялась,
перенос данных не требуется. Миграция не запускалась.

`Subscription` хранит период доступа, текущую provider-связь и `autoRenewalStatus`.
Поля `autoRenewalChangeId` в Subscription больше нет. `ENABLING`/`DISABLING` сохраняются как запрет
конкурирующих изменений между транзакциями; `RETIRED` запрещает включать прежнюю provider-связь,
но не сокращает оплаченный доступ.

`SubscriptionPaymentApplication` хранит неизменяемые `paymentId`, `subscriptionId`, `action`,
`nextSubscriptionStartsAt`, `createdAt`. Наличие записи означает, что доступ за платёж уже начислен.
Этапов настройки автопродления в этой таблице нет.

`AutoRenewalOperation` хранит `id`, `userId`, `type`, `status`, необязательный уникальный `paymentId`,
`subscriptionId`, `provider`, `providerSubscriptionId`, `sourceSubscriptionId`,
`sourceProviderSubscriptionId`, `createdAt`, `updatedAt`. `paymentId` ссылается на применение платежа.
Для TRANSFER `id = paymentId`, обязательны старая локальная связь и снимок её provider ID;
новый provider ID появляется при binding и затем неизменяем.
Этапы TRANSFER: PENDING → BINDING_PENDING → COMPLETED.
CREATED/RENEWED не создают AutoRenewalOperation; SCHEDULED создаёт TRANSFER/PENDING.

Для будущих ручных ENABLE/DISABLE модель допускает null в paymentId и полях старой связи.
ID операции один раз устойчиво создаёт новый DBOS workflow; клиентский ключ в таблице не хранится.
Дедупликация клиентского запуска и сверка его аргументов остаются на уровне workflow.
Ручные use case и workflow пока не реализованы. В D1 `autoRenewalChangeId` будет передаваться
из `AutoRenewalOperation.id`; внешний контракт этого аргумента сохраняется.

### Применение платежа и сериализация

Цепочка: `LocalSubscriptionPaymentHandlerAdapter` → `CommandBus` → use case →
`SubscriptionsRepository` (`PrismaSubscriptionsRepository`). Все изменения используют переданный
`PaymentsTransactionContext`; транзакцией управляет D1. Репозиторий возвращает application-типы.

До чтения результата `applySuccessfulPayment` берёт `lockByUserId`:
`pg_advisory_xact_lock(hashtextextended('subscriptions:user:<userId>', 0))`.
Одинаковая блокировка используется в завершающих обработчиках и должна использоваться будущими
ручными изменениями. Уровень изоляции по умолчанию ReadCommitted не переопределяется.
Блокировка освобождается при commit/rollback; на время provider-вызовов остаётся запрет через
ENABLING/DISABLING. Решения принимаются по чтению после получения блокировки.

`findPaymentApplication(paymentId, tx)` читает применение вместе с операцией автопродления.
Публичный `previousProviderSubscriptionId` восстанавливается из её sourceProviderSubscriptionId,
для CREATED/RENEWED возвращается null. Replay возвращает только прежний публичный результат,
до проверки конкурирующих изменений: ни нового периода, ни второй операции не создаётся.

Первая PURCHASE создаёт период от paidAt, если нет текущих/будущих периодов, незавершённых
изменений и старого включённого автопродления. DAY/WEEK считаются в UTC, MONTH — календарно
с ограничением последним днём месяца. Исторические периоды не должны пересекаться с новым.
Запоздавшее событие не сдвигает доступ: истёкший период сохраняется EXPIRED, будущий PENDING,
действующий ACTIVE. Перед созданием актуализируются статусы истёкших периодов.
Для первой покупки с автопродлением обязателен providerSubscriptionId, иначе конфликт.
D1 передаёт его из текущего Payment, включая обработку старого snapshot SuccessfulPayment.
Без автопродления допускается отсутствие provider ID и сохраняется DISABLED.

Дополнительная PURCHASE выбирает конец очереди, включая PENDING, и создаёт новую подписку
от max(paidAt, expiresAt последней подписки). Старая получает DISABLING, новая ENABLING.
В той же транзакции сохраняются применение платежа и TRANSFER/PENDING со снимками связей.
Истёкшая подписка с ENABLED также требует переноса, чтобы не оставить старое списание.
SCHEDULED требует старую provider-связь, не RETIRED, того же провайдера и autoRenewalRequested=true:
текущий D1 всегда выполняет оба внешних шага. Другие сценарии требуют отдельного согласования.

RENEWAL находит подписку пользователя по provider + providerSubscriptionId, проверяет план
и продлевает существующую строку от expiresAt, сохраняя настройку автопродления.
Пересечение с другим оплаченным периодом отклоняется; очередь автоматически не сдвигается.
Контракт не содержит границ Invoice, поэтому последовательное начисление не заменяет сверку
с provider-периодами. События Business-доступа пока не реализованы.

### Завершающие обработчики: прежний интерфейс D1

Изменения сигнатур остаются предложениями в contract-simplification-proposals.md.

`markProviderSubscriptionCancellationScheduled(subscriptionId, providerSubscriptionId, tx)`
получает ID новой локальной подписки и старый provider ID. `findCancellationOperations` ищет
TRANSFER, связанный с SCHEDULED-применением, по этой паре (take: 2), затем поиск повторяется
под блокировкой владельца. Отсутствие или неоднозначность — SubscriptionCancellationConflictError.
При PENDING одна nested-запись переводит sourceSubscription в RETIRED, операцию — в BINDING_PENDING.
BINDING_PENDING/COMPLETED означают успешный повтор без записи. Даты доступа не меняются.

`bindProviderSubscription(paymentId, subscriptionId, providerSubscriptionId, tx)`
получает владельца применения, берёт lock и перечитывает применение вместе с операцией.
Требует SCHEDULED, соответствующий subscriptionId и наличие TRANSFER.
При BINDING_PENDING одна nested-запись сохраняет provider ID и ENABLED новой подписки,
а операции — COMPLETED и неизменяемый снимок нового providerSubscriptionId.
При COMPLETED совпадающий снимок означает повтор без записи; другой ID — конфликт.
PENDING отклоняется: отключение ещё не подтверждено. Состояния обеих подписок для replay
не перечитываются, поздний повтор не отменяет последующее ручное отключение.
P2002 при привязке преобразуется в SubscriptionBindingConflictError; остальные ошибки передаются
D1 для отката всего локального шага. Внешний API эти методы не вызывают.

Связи, их принадлежность пользователю и различие старой/новой подписок обеспечиваются при создании
операции и не меняются. Provider-снимки не пересчитываются из текущего состояния Subscription.
Будущие ручные операции обязаны соблюдать общий lock, переходные состояния и запрет RETIRED.
Успех локального replay не заменяет идемпотентность внешних шагов D1.

### Чтение текущего доступа

`LocalSubscriptionContextAdapter` → `FindActiveSubscriptionForPurchaseQueryHandler` →
`SubscriptionsQueryRepository`. Prisma-репозиторий ищет ACTIVE/PENDING с startsAt <= now < expiresAt:
задержка фонового переключения не скрывает начавшийся период. Одно совпадение возвращает
{ subscriptionId }, отсутствие — null, несколько — MultipleActiveSubscriptionsError.
Ошибки БД передаются вызывающему коду. Частичный уникальный индекс сохраняет одну ACTIVE-строку
на пользователя. Общая координация lifecycle, ручное автопродление и события доступа ещё требуют
реализации. FK из Payment.subscriptionId не добавлен: старый временный handler мог сохранять
ID без настоящей Subscription. В composition root подключены реальные D2 адаптеры.

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

| Stripe event                           | Семантика Payment Module                                                            | Состояние реализации                   |
| -------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| `checkout.session.completed`           | Enrichment provider references; никогда самостоятельно не означает `SUCCEEDED`      | Реализовано                            |
| `payment_intent.succeeded`             | Подтверждает `PURCHASE + SUBSCRIPTION_EXTENSION`                                    | Реализовано                            |
| `invoice.paid` + `subscription_create` | Подтверждает initial PURCHASE                                                       | Реализовано                            |
| `invoice.paid` + `subscription_cycle`  | Создаёт идемпотентный `RENEWAL` Payment                                             | Реализовано                            |
| `payment_intent.payment_failed`        | Audit/correlation; не меняет lifecycle status                                       | Реализовано                            |
| `invoice.payment_failed`               | Audit/correlation; не меняет lifecycle status                                       | Реализовано                            |
| `checkout.session.expired`             | `CREATED/PENDING -> CANCELED` после reconciliation                                  | Реализовано в worktree, ожидает review |
| `payment_intent.canceled`              | Terminal cancellation только для `PURCHASE + SUBSCRIPTION_EXTENSION`                 | Реализовано, ожидает review            |
| `invoice.voided`                       | Будущая terminal cancellation для unpaid invoice-backed Payment                     | Не реализовано                         |
| `invoice.marked_uncollectible`         | Не считать автоматически `CANCELED`; требуется отдельное решение о terminal failure | Не реализовано                         |
| `customer.subscription.deleted`        | Subscription lifecycle, не отмена исторического Payment                             | Не реализовано                         |
| `charge.refunded` / `refund.*`         | Refund lifecycle, не `CANCELED`                                                     | Не реализовано                         |

## Reconciliation provider references

### Общее правило nullable reference

Optional provider reference означает отсутствие знания, а не отрицательное утверждение.

Для каждой reference, разрешённой конкретным event contract, применяется одна таблица:

| Локальное значение | Значение event  | Результат                                                                  |
| ------------------ | --------------- | -------------------------------------------------------------------------- |
| `null`             | `null`          | Нет знания; ничего не обновлять, конфликта нет                             |
| значение           | `null`          | Event не принёс нового знания; локальное значение сохранить, конфликта нет |
| `null`             | значение        | Совместимое enrichment; сохранить входящее значение                        |
| то же значение     | то же значение  | Идемпотентный no-op                                                        |
| одно значение      | другое значение | `REFERENCE_CONFLICT`, никаких partial updates                              |

Запрещено:

- считать отсутствие optional Stripe field конфликтом;
- очищать локальную reference входящим `null`;
- требовать references, которые не принадлежат текущему object/event;
- прогонять все provider references через универсальный validation независимо от типа события;
- блокировать сохранение `providerCheckoutId` или другой доступной reference из-за отсутствия нерелевантных
  subscription/invoice полей.

### Ownership references по событиям

| Event                                             | References, участвующие в reconciliation/enrichment                                                                                      | Не проверять в этом event                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`, `mode=payment`      | `providerCheckoutId` — обязателен; `providerCustomerId` и `providerPaymentId` — optional knowledge                                       | `providerSubscriptionId`, `providerInvoiceId`                                                     |
| `checkout.session.completed`, `mode=subscription` | `providerCheckoutId` — обязателен; `providerCustomerId` и `providerSubscriptionId` — optional knowledge                                  | `providerInvoiceId`; `providerPaymentId`, если он не является частью явно согласованного contract |
| `checkout.session.expired`                        | `providerCheckoutId` — обязателен; `providerCustomerId` — optional knowledge                                                             | `providerPaymentId`, `providerSubscriptionId`, `providerInvoiceId`                                |
| `payment_intent.succeeded`                        | `providerPaymentId` — ID самого PaymentIntent; `providerCustomerId` — optional knowledge                                                 | `providerSubscriptionId`, `providerInvoiceId`                                                     |
| `payment_intent.payment_failed`                   | `providerPaymentId` для correlation; Customer только если contract его нормализует                                                       | `providerSubscriptionId`, `providerInvoiceId`                                                     |
| `payment_intent.canceled`                         | `providerPaymentId` — ID самого PaymentIntent; `providerCustomerId` — optional knowledge                                                 | `providerSubscriptionId`, `providerInvoiceId`                                                     |
| `invoice.paid`                                    | `providerInvoiceId` — ID Invoice; `providerSubscriptionId` для subscription invoice; `providerPaymentId` и Customer — optional knowledge | Checkout reference                                                                                |
| `invoice.payment_failed`                          | То же пространство references, что у Invoice, но только для audit/correlation                                                            | Checkout reference                                                                                |

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
- преобразует ошибку durable enqueue в `PaymentWebhookEnqueueUnavailableError`, чтобы HTTP вернул
  Stripe статус `503` без утечки DBOS-контрактов в application/presentation;
- в V7 повторяет временные application failures в новых транзакциях через durable таймеры;
  `RETRYING` — audit-состояние, а не самостоятельный механизм планирования;
- отделяет недоступный контекст от доказанного конфликта: нерешаемые ожиданием случаи и
  исчерпание application retry переводит в `RECONCILIATION_REQUIRED`;
- завершает известные business conflicts и invalid-state errors как `IGNORED` или `DEAD`, а не
  бесконечным retry;
- использует `shouldRetry` для provider steps и сохраняет исчерпание step retries как
  `DBOS_STEP_RETRIES_EXHAUSTED`;
- оставляет превышение `maxRecoveryAttempts` всего workflow системному DBOS dead-letter queue:
  после этого порога код workflow уже не исполняется, поэтому синхронизация локального webhook audit
  требует отдельного DLQ reconciler/monitor.

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

Payments является hybrid-сервисом. `PaymentsError` преобразуется только на presentation boundary:

- gRPC controllers используют `PaymentsRpcExceptionFilter` и gRPC status/metadata;
- Stripe webhook controller использует узкий `PaymentWebhookHttpExceptionFilter`: наружу отображаются
  `InvalidProviderEventError` (`400`), `PaymentProviderUnavailableError` (`503`) только для временно
  недоступной проверки webhook и `PaymentWebhookEnqueueUnavailableError` (`503`) со стабильным телом
  `{ statusCode, code, message }`;
- будущие HTTP endpoints должны определять собственный boundary mapper вместо автоматической
  публикации всего множества `PaymentsErrorCode` как HTTP-контракта;
- application/domain ошибки не импортируют HTTP, gRPC или Nest transport types.

Business classification и reconciliation должны находиться в use case. Prisma repository получает
подготовленную command и отвечает только за условное атомарное обновление/создание.

### Reconciliation outcome vocabulary

Provider-independent reconciliation conflicts определены в одном application-level vocabulary:

- `PAYMENT_RECONCILIATION_CONFLICT` содержит стабильные runtime-значения outcomes;
- `PaymentReconciliationConflict` выводится из этого объекта и не дублирует строковый union;
- reconciliation conflict преобразуется в `PaymentEventResultCode` внутри event handler;
- `paymentEventResult` является единственной фабрикой нормализованных результатов;
- use cases не должны вручную создавать result или возвращать строковые outcome literals.

Добавление нового общего reconciliation conflict выполняется в vocabulary один раз. После этого
`PaymentEventResultCode` и нужные event policies расширяются согласованно. Связанные данные
(`paymentId` и успешный `Payment`) контролируются типом и фабрикой общего result contract.

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

### Формирование provider idempotency keys

Префикс и итоговую строку idempotency key формирует concrete outbound provider adapter. Для Stripe
это `StripePaymentProvider`: только он знает namespace операций Stripe и преобразует стабильный
application `operationId` в provider key. Application use cases, D2 gateways и workflow передают
семантический `operationId` без provider-specific приставок.

`ProviderEventAdapter` не является границей формирования ключей. Это inbound boundary, который после
проверки подписи преобразует входящий webhook в нормализованный `PaymentEvent`; исходящие provider
команды и правила их replay к нему не относятся. Outbound boundary — `PaymentProviderPort`, а
форматирование ключа является ответственностью его infrastructure-реализации.

Правила:

- один `operationId` стабильно идентифицирует одну логическую операцию и не меняется при retry/replay;
- разные provider-операции получают разные prefixes, чтобы одинаковый identity не объединял
  создание Checkout, Product, Subscription или изменение auto-renewal;
- use case не передаёт готовый `idempotencyKey` в `PaymentProviderPort`; port принимает
  `operationId`, а adapter строит итоговый ключ непосредственно перед вызовом SDK;
- пользовательский `Payment.idempotentKey` для дедупликации команды создания Payment является
  отдельным бизнес-контрактом и не используется как готовый Stripe idempotency key;
- уже опубликованный prefix нельзя молча менять: это нарушает replay для ранее начатой операции;
  новая несовместимая схема требует versioned migration/operation.

Исключение для Step 3: операция перевода прежней provider Subscription в
`cancel_at_period_end=true` является единственным необратимым переходом этой provider-связи. После
него D2 запрещает возвращать прежнюю связь в auto-renewal. Поэтому
`providerSubscriptionId` одновременно является стабильной identity этой terminal-операции, а replay
с тем же ключом безопасен. Это исключение недействительно для управляемой текущей provider
Subscription, где enable/disable являются разными повторяемыми переходами и требуют отдельного
`autoRenewalChangeId`.

Текущие Stripe namespaces:

- `checkout:STRIPE:<operationId>`;
- `customer:create:<internalUserId>`;
- `subscription:cancel-at-period-end:<providerSubscriptionId>`;
- `subscription-product:<operationId>` для Product отложенной Subscription;
- `subscription:create:<operationId>` для самой отложенной Subscription;
- `subscription-auto-renewal:<autoRenewalChangeId>:enable|disable`.

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

Все event-specific handlers возвращают единый `PaymentEventResult` из
`payment-events/payment-event-result.ts`. Result содержит только нормализованный processing status
`SUCCESS`, `IGNORED` или `DEAD`, централизованный `PaymentEventResultCode` и связанные данные,
разрешённые фабрикой `paymentEventResult`. Собственные handler outcomes вроде `APPLIED`, `CANCELED`,
`CORRELATED` и `UNCORRELATED` не являются application boundary. `ApplyPaymentEventUseCase` является
единственным местом, которое преобразует `PaymentEventResult` в webhook audit transition или
продолжение successful-payment workflow.

Каждый event-specific slice расположен в собственной kebab-case директории и содержит colocated
use case и spec, например `payment-events/confirm-invoice-paid/` или
`payment-events/cancel-expired-checkout-session/`. Общие для нескольких событий contracts и policies
(`payment-event-result.ts`, `payment-reconciliation.policy.ts`) остаются в корне
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
  `processPaymentWebhookV6`; V6 дополнительно фиксирует retryable/terminal workflow failures,
  обязательный refactor безопасных audit/log сообщений выполнен, срез принят;
- slice 7 — не начат.

### Данные успешного платежа

Step 1 передаёт дальше provider-independent `SuccessfulPayment` со следующими полями:

- `paymentId`, `userId`, `planId`;
- `type`, `autoRenewalRequested`, nullable `targetSubscriptionId`;
- `amount`, `currency`, `periodCount`, `periodUnit`;
- `provider`, `providerCustomerId`, `providerSubscriptionId`;
- `paidAt` как ISO-8601 string.

D1 до создания Payment читает `SubscriptionContextPort.findActiveSubscriptionForPurchase(userId)`:
объект с subscriptionId означает дополнительную покупку, null — первую. ID сохраняется
в Payment.targetSubscriptionId и передаётся в SuccessfulPayment. Это снимок контекста Checkout;
D2 определяет очередь по userId, а цель RENEWAL — по provider-связи.
Резервация первой покупки остаётся в Payments. Ошибка чтения останавливает Checkout.

`CheckoutPurpose` не входит в `SuccessfulPayment`. Он описывает исходный purchase intent и
pre-payment concurrency policy. После financial reconciliation дальнейший workflow следует явному
результату D2 (`CREATED`, `SCHEDULED` или `RENEWED`) и не интерпретирует CheckoutPurpose повторно.

Step 1 возвращает единый `PaymentEventResult` со статусом `SUCCESS`, `IGNORED` или `DEAD` и
операционным `PaymentEventResultCode`. Только результат
`SUCCESS + PAYMENT_SUCCEEDED` содержит `SuccessfulPayment` для step 2. `eventId` остаётся контекстом
workflow и не дублируется в результате event-specific use case.

При replay уже успешного Payment step 1 также возвращает `SUCCEEDED` с существующим Payment:
повтор финансового события не должен пропустить ещё не завершённое применение Payment в D2. При этом
финансовая запись повторно не изменяется и исходный `paidAt` сохраняется.

### Step 1: financial reconciliation

- принять `eventId` и нормализованный `PaymentEvent`; technical attempt остаётся в DBOS coordinator;
- в собственной транзакции выполнить существующую event-specific reconciliation и изменить только
  финансовое состояние Payment;
- для `invoice.paid/subscription_cycle` идемпотентно создать или найти `RENEWAL` Payment;
- вернуть `SuccessfulPayment` только для доказанного `SUCCEEDED`, включая совместимый replay уже
  успешного Payment;
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
    nextSubscriptionStartsAt: string;
    previousProviderSubscriptionId: string | null;
  }>;
}
```

Application boundary этого шага называется `LinkPaymentToSubscriptionUseCase`, а явный DBOS step —
`linkPaymentToSubscriptionStep`. Названия отражают результат orchestration: успешный Payment получает
связь с локальной Subscription, выбранной или созданной D2. Step зарегистрирован через
`@DBOS.step({ name: 'linkPaymentToSubscriptionStep', ...retryPolicy })`, вызывается из
актуального `processPaymentWebhookV6` после результата `SUCCESS + PAYMENT_SUCCEEDED` и выполняет use case в отдельной
транзакции `linkPaymentToSubscription`.

Payments определяет только этот application port и orchestration вокруг него. Domain model,
persistence и concrete implementation `SubscriptionPaymentHandler` принадлежат D2 и реализуются
вторым разработчиком. Текущий infrastructure adapter является явно временным диагностическим стендом:
он генерирует `subscriptionId` и рассчитывает `nextSubscriptionStartsAt`, но не создаёт настоящую
Subscription entity.

Для `SCHEDULED` `nextSubscriptionStartsAt` — момент начала следующего provider-managed billing period
и первого следующего автоматического списания. Он наступает после окончания всей уже оплаченной
локальной цепочки периодов, включая период, предоставленный текущим Payment. Например, если активный
период заканчивается `2026-11-01T00:00:00.000Z`, а текущая покупка оплачивает следующий месяц до
`2026-12-01T00:00:00.000Z`, значение равно `2026-12-01T00:00:00.000Z`, а не дате начала купленного
периода. Его вычисляет D2 из собственного упорядоченного Subscription lifecycle. Это не время создания
Stripe Subscription и не дата ответа provider. D1 не выводит значение из Stripe
`current_period_end`, `Payment.paidAt` или `CheckoutPurpose`, не прибавляет период и не корректирует
его самостоятельно. Через durable workflow поле передаётся в каноническом UTC ISO-8601 формате с
суффиксом `Z`; невалидное или не-UTC значение является `INVALID_HANDLER_RESULT`.

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
`nextSubscriptionStartsAt`.

- идемпотентно установить старой Stripe Subscription `cancel_at_period_end: true`;
- не отменять её немедленно: она остаётся активной до конца уже оплаченного Stripe-периода;
- после ответа Stripe в локальной транзакции установить старой локальной подписке `RETIRED`,
  а операции платежа — `BINDING_PENDING`;
- после этой фиксации прежняя provider Subscription остаётся доступной до конца
  оплаченного периода, но её transition необратим: D2 больше не разрешает для неё enable/disable
  auto-renewal;
- после создания и binding новой provider Subscription операции enable/disable могут применяться
  только к ней как к текущей управляемой provider-связи;
- вычисленный D2 `nextSubscriptionStartsAt` остаётся источником истины для начала следующей Subscription;
- Stripe `current_period_end` не переносится в application/workflow contract и не сравнивается с
  `nextSubscriptionStartsAt`: это граница прежнего provider-периода, а
  `nextSubscriptionStartsAt` — рассчитанный D2 момент начала следующей локальной Subscription;
- replay повторно устанавливает то же состояние и не создаёт дополнительного перехода.

Реализованный application boundary `ScheduleProviderSubscriptionCancellationUseCase` разделяет
provider-вызов и локальную фиксацию. `scheduleProviderSubscriptionCancellationStep` сначала вызывает
Stripe adapter с `cancel_at_period_end: true`, не удерживая Prisma-транзакцию, а затем в отдельной
транзакции вызывает `SubscriptionPaymentHandler.markProviderSubscriptionCancellationScheduled`
с `params.subscriptionId`, прежним provider ID и общим tx.
Ответ provider подтверждает только идентификатор Subscription и `cancel_at_period_end: true`.
Billing anchor следующей Subscription берётся исключительно из `nextSubscriptionStartsAt`; ответ Stripe
его не корректирует. Подключён LocalSubscriptionPaymentHandlerAdapter с фиксацией этапа операции.

### Step 4: создание отложенной Stripe Subscription

Step получает `eventId`, `SuccessfulPayment`, `subscriptionId`, `nextSubscriptionStartsAt` и прежний
provider ID.

- создать Stripe Subscription для купленного плана с customer, стоимостью и периодом из
  зафиксированного Payment snapshot;
- передать `billing_cycle_anchor = nextSubscriptionStartsAt` и `proration_behavior = 'none'`;
- не рассчитывать и не сдвигать anchor в D1/Stripe adapter: готовое значение предоставляет D2 в
  каноническом UTC ISO-8601 формате с суффиксом `Z`;
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
затем Subscription с recurring Price, `billing_cycle_anchor = nextSubscriptionStartsAt`,
`proration_behavior = 'none'`
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
- новая Stripe Subscription получает вычисленный D2 UTC `nextSubscriptionStartsAt` как
  `billing_cycle_anchor` и
  `proration_behavior: 'none'`;
- новый provider ID атомарно сохраняется в Payment и D2;
- конфликт provider ID не оставляет partial update;
- webhook становится `PROCESSED` только после последнего обязательного step.

## Технический долг

Этот раздел фиксирует известные архитектурные долги, которые не должны теряться между event slices.
Новый Stripe event нельзя начинать, если для предыдущего slice указан обязательный refactor.

### `providerPaymentId` не извлекается из Stripe event

Статус: открытый дефект, требует investigation до изменения event contract.

В фактической обработке Stripe webhook значение PaymentIntent ID не извлекается из
события, и `Payment.providerPaymentId` (`provider_payment_id` в БД) остаётся `null`. Текущий код
ожидает ID в `checkout.session.payment_intent`, `invoice.payment_intent` или в `id` объекта
`payment_intent.*`, но реальная форма полученного event ещё не сопоставлена с этими
ожиданиями.

Перед исправлением нужно:

- определить конкретный event type и Checkout mode, на которых поле остаётся пустым;
- сверить sanitized `PaymentWebhook.providerSnapshot` с формой Stripe object для
  API version `2026-08-26.dahlia`;
- проверить, где в этой версии API находится связь Invoice/Checkout с PaymentIntent и не
  была ли она перенесена в другой object;
- проверить normalized event после Stripe adapter и command, передаваемую в repository;
- не подменять PaymentIntent ID значением Checkout, Invoice, Charge или Subscription ID.

Критерий исправления: для каждого supported success-event определён авторитетный
источник PaymentIntent ID, adapter нормализует его в `providerPaymentId`, repository атомарно
сохраняет его, а replay того же event идемпотентен.

### Безопасная фиксация ошибок webhook workflow

Статус: refactor V6 выполнен, решение `ACCEPT_AND_CONTINUE`.

Refactor разделяет два разных назначения данных об ошибке:

- durable audit состояния `PaymentWebhook`;
- operational diagnostics в логах/observability.

`toPaymentEventFailure` сохраняет стабильный error code и контролируемое приложением безопасное
сообщение. Исходные `error.message` и `error.stack` не попадают в `PaymentWebhook.processingError`
или стандартные workflow/HTTP logs.

Зафиксированная семантика:

- durable audit хранит только стабильный allowlisted `processingErrorCode`; произвольный текст
  исключения не является частью persistence contract;
- `PaymentEventFailure` представляет классификацию результата обработки, а не диагностический dump;
- автоматическая обработка и поиск строятся по стабильному error code, но не по имени класса или
  тексту исключения;
- operational log каждой ошибки содержит correlation identifiers: локальный `webhookId`, DBOS
  `workflowId`, Stripe `providerEventId`, nullable `paymentId`, номер попытки и `traceId`/`spanId`,
  когда tracing доступен;
- `errorName` допустим только как дополнительная диагностика и не заменяет стабильный error code;
- стандартные application logs содержат только allowlisted поля и контролируемые приложением
  сообщения; исходные `error.message` и `error.stack` нельзя логировать без явной redaction policy;
- полный exception/stack допустим только в защищённом observability-контуре с redaction, ограниченным
  доступом и согласованной retention policy;
- enqueue failure, возникающий до создания локальной webhook-записи, коррелируется через стабильный
  `workflowId` и `providerEventId`.

После refactor оператор должен иметь возможность начать с `PaymentWebhook.id`, `workflowId`,
`providerEventId` или `processingErrorCode` и найти связанную диагностику без хранения сырого текста
ошибки в Payments DB.

Минимальные acceptance scenarios:

- неизвестная ошибка переводится в `UNEXPECTED_WORKFLOW_ERROR` без сохранения исходного message;
- исчерпание DBOS step retries переводится в `DBOS_STEP_RETRIES_EXHAUSTED` без объединённого текста
  предыдущих исключений;
- retryable и terminal состояния сохраняют только allowlisted code;
- structured logs содержат correlation identifiers и не содержат raw message/stack;
- известные `PaymentsError` продолжают классифицироваться по `PaymentsErrorCode`.

## Следующие event slices

`payment_intent.canceled` реализован отдельным slice со следующими правилами:

- metadata `paymentId` является основным correlation source, `providerPaymentId` — fallback;
- только `PURCHASE + SUBSCRIPTION_EXTENSION` может перейти из `CREATED/PENDING` в `CANCELED`;
- `INITIAL_SUBSCRIPTION`, `RENEWAL` и terminal Payment не изменяются;
- duplicate для уже отменённого подходящего Payment идемпотентен;
- provider/customer reference conflict не оставляет partial update;
- adapter сохраняет только PaymentIntent ID, nullable Customer ID и время события; cancellation
  reason и payment-method данные не входят в нормализованный event.

После принятия `payment_intent.canceled`:

1. `invoice.voided`;
2. отдельное архитектурное решение для `invoice.marked_uncollectible`;
3. отдельно refund lifecycle и subscription lifecycle events.

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


## Срез invoice.finalized: ожидает review

Добавлен `invoice.finalized/subscription_cycle -> RENEWAL/PENDING` с идемпотентностью по Invoice.
Скидки недоступны; кредитный баланс не используется. Стоимость сверяется с сохранённым контекстом
provider Subscription, без переоценки по текущему Plan. Нулевой Invoice не поддерживается и получает
`AMOUNT_MISMATCH`. PaymentIntent при finalized не сохраняется. InvoicePayment и несколько PaymentIntent на Invoice
исключены из текущей итерации и не являются блокером.
Поздний finalized не понижает успешный Payment и не запускает D2. Invoice paid подтверждает существующий
pending renewal; прежний recovery создания успешного renewal сохранён. Failure recovery и voided не входят
в этот срез. Подробности и ограничения указаны в README payment-events.


### Уточнённые границы итерации renewal

- После review первого среза следующий event slice — `invoice.voided`.
- Создание renewal из `invoice.payment_failed` и failure recovery подлежат обсуждению при детализации
  следующего среза; реализация ещё не согласована.
- `invoice.marked_uncollectible`, InvoicePayment/несколько PaymentIntent, скидки, кредитный баланс
  и бесплатные периоды исключены из текущей итерации.
- Изменение цены существующего recurring billing отложено на следующую итерацию.
- Renewal дедуплицируется по `(providerType, providerInvoiceId)`; вычисляемого idempotency key
  и передачи `idempotentKey` в контракте создания renewal нет.


## Уточнение renewal context: metadata исходной оплаты (2026-10-23, ожидает review)

Это уточнение заменяет прежний выбор первой Payment по provider Subscription ID в paid/finalized.
Контракт Stripe metadata не меняется: `paymentId` указывает на конкретную исходную PURCHASE,
`subscriptionId` deferred Subscription — на локальную Subscription. Адаптеры Invoice извлекают
envelope `paymentId` из Invoice metadata с fallback на снимок Subscription metadata независимо от
`billingReason`. Для renewal они дополнительно нормализуют снимок Subscription metadata в
`sourcePaymentId` и `sourceSubscriptionId`. Для initial Subscription без metadata subscriptionId используется
уже установленная локальная связь конкретной исходной Payment.

Исходная Payment должна быть SUCCEEDED с paidAt и установленными local/provider Subscription links.
Она предоставляет userId, planId, periodCount, periodUnit и локальную связь, но её amount/currency
не сравниваются с новым Invoice и не копируются в renewal. Новая сумма и валюта берутся из Invoice
(amount_due при finalized, amount_paid при paid). Контракт recurring-подписки не изменяется.

`ConfirmRenewalPaymentUseCase` обрабатывает найденную или возвращённую upsert Payment единым путём,
без рекурсии/повторного поиска и максимум с одной попыткой подтверждения. Проверяются все поля
контекста конкурентного upsert. Недоступный source-контекст/привязка и исчезнувшая после UPDATE
renewal вызывают retryable PAYMENT_PERSISTENCE_FAILED вместо IGNORED/PAYMENT_NOT_FOUND.
Повтор остаётся ответственностью workflow; ручная reconciliation может потребоваться при
постоянно отсутствующем metadata. Старые нормализованные события читаются, но автоматически
не обогащаются из snapshot. Существующая renewal может обрабатываться без source metadata.

Скидки/credit balance/нулевые суммы и смена recurring-контракта по-прежнему не входят в scope.
Сумма существующей PENDING сверяется с paid Invoice; данный рефакторинг исправляет сравнение
с историческим source, не вводит отдельную модель expected/collected amounts.
Фактические проверки этого изменения не запускались согласно verification policy.


## Workflow V7: bounded application retry и reconciliation (2026-10-23, ожидает review)

Это уточнение заменяет прежнее утверждение, что markRetrying + throw автоматически планирует
повтор application-транзакции. В установленном DBOS datasource.runTransaction нельзя вызывать
внутри @DBOS.step. V7 использует workflow-level bounded loop, отдельную транзакцию на попытку
и durable DBOS.sleepSeconds между попытками. Лимит 10 попыток; интервалы 10, 20, 40, 80, 160,
320, 640, 1280, 2560 секунд (суммарно 5110 секунд ожидания без времени выполнения).
V6 остаётся зарегистрированным с прежней последовательностью durable-операций; новые события
запускают processPaymentWebhookV7. Существующие workflow не мигрируются автоматически.

RenewalPaymentContextUnavailableError имеет собственный application error code и больше не
наследуется от PaymentPersistenceError. SOURCE_PAYMENT_NOT_FOUND и SOURCE_NOT_LINKED повторяются;
SOURCE_METADATA_MISSING и PAYMENT_DISAPPEARED сразу требуют reconciliation. После исчерпания
application-попыток событие получает RECONCILIATION_REQUIRED и код PAYMENT_APPLICATION_RETRIES_EXHAUSTED
с кодом последней ошибки в безопасном audit message. Противоречивые business outcomes остаются DEAD.

RECONCILIATION_REQUIRED — состояние PaymentWebhook, не Payment. processedAt остаётся null.
Оно останавливает текущий workflow без изменения финансового статуса Payment. Административный
API/worker восстановления metadata и запуска нового replay не добавлен; состояние явно выделяет
работу для reconciliation, а не обещает самовосстановление неизменяемого события.

V7 повторяет application-транзакции финансовой reconciliation, D2 linking и локальной фиксации
результатов provider calls. Успешный внешний step не повторяется из-за ошибки следующей локальной
записи. До появления inbox-записи также есть ограниченные durable retries; если БД недоступна
весь лимит, workflow завершается ошибкой, так как фиксировать reconciliation ещё негде.
Ошибка записи RETRYING не блокирует планирование следующей durable-попытки. Финальное сохранение
DEAD/reconciliation по-прежнему требует доступности БД.

Для datasource recovery безопасная классификация ошибки сохраняется в serializable Error envelope
до rollback: решение не зависит от сохранения prototype пользовательского exception после replay.
Неизвестные provider/SQL тексты не попадают в audit envelope. Миграция добавляет значение
WebhookProcessingStatus.RECONCILIATION_REQUIRED; применять её нужно до запуска V7.
Prisma Client сгенерирован штатной командой. Tests/build/lint не запускались.


### Infrastructure retry helper (2026-10-23)

Циклы V7 вынесены в `DbosPaymentWebhookRetryService` рядом с DBOS workflow.
Workflow передаёт явную policy: `maxAttempts: 10`, `initialDelaySeconds: 10`,
`backoffRate: 2`. Helper — обычный объект без DBOS-декораторов, который использует
переданные datasource, event repository и logger workflow. Он не добавляет durable
операций и не меняет их имена, порядок, аргументы или интервалы V7; V6 не изменён.
`runTransaction` сохраняет audit, safe error envelope и terminal/reconciliation
семантику. `runBeforeEventPersisted` повторяет начальное сохранение без audit,
поскольку записи события ещё может не существовать. Provider step retries не изменены.
Tests/build/lint/formatter не запускались согласно verification policy.


### Retry responsibility split (2026-10-24)

Это уточнение заменяет описание ответственности helper от 2026-10-23.
`classifyPaymentWorkflowError` — единственная функция с правилами классификации
и построения безопасной audit-ошибки. `isRetryablePaymentWorkflowError` и
`toPaymentEventFailure` только проецируют её результат для совместимости.
Retry service больше не зависит от datasource, event repository, logger или
payment error policy. `run` принимает операцию, retry policy, `shouldRetry` и
необязательный `onRetry`; выполняет bounded retry и durable sleep. Окончательная
ошибка поднимается как `PaymentWebhookRetryError` с исходной cause, именем операции,
номером попытки и признаком исчерпания лимита. Этот envelope создаётся вне durable
транзакций; безопасный `PaymentWorkflowAttemptError` для transaction replay сохранён.
Workflow владеет транзакциями и retry audit. В catch `process` фиксируются DEAD или
RECONCILIATION_REQUIRED; управляющий `PaymentWorkflowProcessingStoppedError` удалён.
Ошибка финальной записи статуса выходит из process напрямую и не переклассифицируется
как ошибка платёжной операции. До создания inbox-записи ошибка поднимается без
фиксации статуса. Лимиты, имена и последовательность durable операций для успешной
обработки и штатных retry/finalization путей V7 сохранены; V6 и provider retries
сохраняют прежнее поведение. Добавлены unit-сценарии retry wrapper и сбоя final audit.
Tests/build/lint/formatter не запускались согласно verification policy.
