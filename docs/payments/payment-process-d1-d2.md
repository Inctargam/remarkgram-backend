# Процесс платежа: D1 и D2

**D1 — платежи коллеги. D2 — твои подписки.**

Описание соответствует текущим контрактам D1/D2; все четыре метода D2 подключены к БД.

1. **Создание платежа.**

   Пользователь выбирает тариф и нажимает оплатить.

   **Ты:** через `findActiveSubscriptionForPurchase(userId)` возвращаешь ID активной подписки или null.

   ```ts
   abstract class SubscriptionContextPort {
     abstract findActiveSubscriptionForPurchase(userId: number): Promise<{ subscriptionId: string } | null>;
   }
   ```

   Объект с subscriptionId — подписка есть, null — нет. Ошибка чтения пробрасывается.
   D1 выбирает CheckoutPurpose и сохраняет ID в Payment.targetSubscriptionId.
   Этот запрос не резервирует период и не гарантирует состояние на момент оплаты.

   D1 сохраняет Payment с условиями покупки и контекстом подписки, создаёт checkout
   у Stripe и возвращает пользователю ссылку. В текущем API покупка предполагает
   включение автопродления.

2. **Оплата и webhook.**

   Пользователь оплачивает. Stripe присылает webhook. D1 проверяет подпись,
   нормализует событие и надёжно ставит его обработку в DBOS. Workflow сохраняет
   событие и начинает обработку.

   Возврат пользователя на сайт не доказывает оплату.
   `checkout.session.completed` сам по себе тоже не подтверждает финансовый успех:
   для поддерживаемых сценариев его подтверждают `invoice.paid` или
   `payment_intent.succeeded`.

3. **Подтверждение денег — первая бизнес-транзакция.**

   D1 сопоставляет событие с платежом, проверяет финансовые данные и сохраняет
   `Payment.status = SUCCEEDED` и `paidAt`.

   Транзакция завершается: **факт оплаты уже сохранён, но доступ ещё может быть
   не предоставлен.**

4. **Предоставление доступа — вторая бизнес-транзакция.**

   D1 вызывает твой `applySuccessfulPayment(payment, tx)`.

   Данные, которые D1 передаёт тебе после подтверждения оплаты:

   ```ts
   type SuccessfulPayment = {
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
   };
   ```

   Здесь поля раскрыты для чтения: в исходном типе используется `Readonly`,
   а часть типов берётся из `Payment`. Сам объект является неизменяемым снимком оплаты.
   Текущие значения enum:

   - `PaymentType`: `PURCHASE`, `RENEWAL`;
   - `Currency`: `USD`;
   - `PeriodUnit`: `DAY`, `WEEK`, `MONTH`;
   - доменный `PaymentProvider`: сейчас только `STRIPE`.

   `paymentId` — ключ идемпотентности применения платежа.
   `periodCount` и `periodUnit` — оплаченная длительность из snapshot платежа.
   `paidAt` — время оплаты в UTC ISO-8601, а не дата начала будущего периода.
   targetSubscriptionId — снимок Checkout. Очередь определяется по userId;
   цель автопродления — по provider + providerSubscriptionId.
   `autoRenewalRequested` — намерение при покупке, а не текущее состояние автопродления.

   **Ты:** проверяешь, не применялся ли этот `paymentId`, и определяешь результат:

   | Сценарий | Твоя операция | `action` |
   | --- | --- | --- |
   | Первая покупка | Создать первую локальную подписку и оплаченный период | `CREATED` |
   | Дополнительная покупка | Запланировать новый период после существующих оплаченных периодов | `SCHEDULED` |
   | Автосписание | Продлить соответствующую существующую подписку | `RENEWED` |

   Контракт твоего результата:

   ```ts
   type ApplySuccessfulPaymentAction = 'CREATED' | 'SCHEDULED' | 'RENEWED';

   type ApplySuccessfulPaymentResult = {
     subscriptionId: string;
     action: ApplySuccessfulPaymentAction;
     nextSubscriptionStartsAt: string;
     previousProviderSubscriptionId: string | null;
   };
   ```

   `action` — результат операции, а не статус подписки в БД.
   Повторный вызов с тем же `paymentId` должен вернуть весь ранее сохранённый
   результат, включая дату и предыдущий provider ID.

   Полный порт D1 → D2 для этого и следующих шагов:

   ```ts
   type PaymentsTransactionContext = object;

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

   `tx` — непрозрачный для application-слоя контекст текущей транзакции.
   Его нужно передать своим репозиториям; самостоятельно завершать транзакцию
   или сохранять контекст для следующего шага нельзя.

   Ты сохраняешь изменения и SubscriptionPaymentApplication с неизменяемым результатом.
   Для SCHEDULED дополнительно создаётся AutoRenewalOperation типа TRANSFER со статусом PENDING
   и ID, равным paymentId. Для CREATED/RENEWED операция автопродления не создаётся.
   Старую связь и provider-снимки хранит AutoRenewalOperation; этапов в применении платежа нет.
   D1 записывает возвращённый
   `subscriptionId` в Payment.

   **Твои изменения и связь `Payment.subscriptionId` фиксируются одной транзакцией.**
   Если этот шаг падает, оба изменения откатываются, но `SUCCEEDED` из шага 3 сохраняется.

   Для `SCHEDULED` ты также возвращаешь ID прежней provider-подписки и
   `nextSubscriptionStartsAt` — дату следующего автосписания после окончания
   всей оплаченной цепочки, включая текущую покупку.

   Например: текущий период заканчивается 1 ноября, пользователь докупил месяц
   до 1 декабря — следующее списание должно быть 1 декабря.

   `nextSubscriptionStartsAt` возвращается в каноническом UTC ISO-8601, например
   `2026-12-01T00:00:00.000Z`. По текущему контракту поле обязательно для всех
   `action`, хотя как дату следующего списания workflow использует его только
   для `SCHEDULED`. `previousProviderSubscriptionId` обязателен и непустой для
   `SCHEDULED`; для `CREATED` и `RENEWED` возвращается `null`.

5. **Настройка будущих списаний — только для `SCHEDULED`.**

   D1 просит Stripe отключить продление старой provider-подписки в конце её
   оплаченного периода.

   **Ты:** после подтверждения через `markProviderSubscriptionCancellationScheduled`
   фиксируешь завершение старой provider-связи. Она сохраняется для учёта,
   но больше не допускает переключения автопродления.

   В `markProviderSubscriptionCancellationScheduled` D1 передаёт:
   `subscriptionId` новой локальной подписки, прежний `previousProviderSubscriptionId`
   как аргумент `providerSubscriptionId` и контекст новой локальной транзакции.
   По новой подписке и старому provider ID ты находишь единственную TRANSFER-операцию, связанную с SCHEDULED-применением,
   берёшь lock пользователя и повторяешь поиск.
   При PENDING записываешь старой подписке RETIRED, операции — BINDING_PENDING.
   BINDING_PENDING и COMPLETED означают повтор без записи после проверки старого provider ID.

   Затем D1 создаёт новую provider-подписку с датой следующего списания,
   рассчитанной тобой.

   **Ты:** через `bindProviderSubscription` сохраняешь новую provider-связь
   и завершаешь переход. D1 в той же локальной транзакции сохраняет новый
   `Payment.providerSubscriptionId` и помечает webhook обработанным.

   В `bindProviderSubscription` приходят paymentId, локальный subscriptionId, новый ID Stripe и tx.
   Проверяешь совпадение локального ID со связью операции.
   При BINDING_PENDING ты атомарно сохраняешь новой подписке provider ID и ENABLED,
   операции — COMPLETED и снимок AutoRenewalOperation.providerSubscriptionId. При COMPLETED повтор
   сравнивается со снимком и ничего не меняет. Другой provider ID — конфликт.
   При PENDING привязка отклоняется: старое отключение ещё не подтверждено.
   Оба метода возвращают `Promise<void>`: успешное завершение означает, что
   локальные изменения выполнены в переданном `tx`; commit выполняет вызывающая сторона.
   Эти методы не начисляют оплаченный период повторно и не вызывают Stripe.

   Вызовы Stripe выполняются **вне транзакций БД**. Их подтверждённые результаты
   записываются отдельными локальными транзакциями.

6. **Завершение обработки и обновление доступа.**

   Для `CREATED` и `RENEWED` D1 помечает webhook обработанным уже в транзакции шага 4.
   Для `SCHEDULED` — после завершения шага 5.

   **Твоя отдельная обязанность:** при изменении Business-доступа сохранить событие
   в outbox вместе с соответствующим изменением состояния. Затем событие доставляется
   в User Accounts для обновления типа аккаунта.

**Если процесс падает**, DBOS управляет восстановлением и повторами.
Например, после шага 3 деньги уже подтверждены, а предоставление доступа можно повторить.
Поэтому твои методы должны быть идемпотентными: повтор того же платежа возвращает
сохранённый результат и не добавляет второй период. Временная ошибка допускает повтор;
ошибка в коде или бизнес-конфликт могут потребовать исправления.

**При очередном автосписании** пользователь checkout не открывает. Stripe присылает
подтверждение оплаты, D1 создаёт Payment типа `RENEWAL`, а ты продлеваешь соответствующую
подписку через `applySuccessfulPayment`. Замена provider-подписки из шага 5 не выполняется.

**Вне процесса оплаты ты также реализуешь:** просмотр подписок, окончание периодов,
активацию следующего оплаченного периода и управление автопродлением. Для переключения
автопродления ты сохраняешь переходное состояние, вызываешь порт D1 после commit
и фиксируешь подтверждённый результат. Сам вызов Stripe выполняет D1.

Контракт для переключения автопродления направлен **D2 → D1**:

```ts
type ChangeProviderSubscriptionAutoRenewalCommand = {
  provider: 'STRIPE';
  providerSubscriptionId: string;
  autoRenewalChangeId: string;
};

type ChangeProviderSubscriptionAutoRenewalResult = {
  providerSubscriptionId: string;
  autoRenewalEnabled: boolean;
};

abstract class ProviderSubscriptionAutoRenewalGateway {
  abstract enable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;

  abstract disable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;
}
```

Это описанный в документации будущий порт D2, который ещё нужно объявить в коде.
Готовый адаптер D1 — `PaymentsProviderSubscriptionAutoRenewalAdapter` —
уже предоставляет `enable` и `disable` с этими входными и выходными данными.

Будущий DBOS workflow один раз устойчиво создаёт AutoRenewalOperation.id и использует его
для всех повторов, в том числе передаёт D1 как autoRenewalChangeId. В Subscription это поле
больше не хранится. Следующее изменение получает новую операцию; клиентский ключ в таблицу
не записывается. Дедупликация запуска и сверка аргументов остаются на уровне workflow.
Ручные use case/workflow ещё не реализованы.
Вызов выполняется после commit переходного состояния, без открытой DB-транзакции.
Стабильное состояние подтверждается только после ответа для нужной provider-связи
и нужной операции. Timeout не доказывает, что настройка не изменилась;
запоздавший ответ старой операции не должен перезаписывать новое решение.

Подробности стыков: [успешный платёж](./successful-payment-d1-d2-contract.md),
[автопродление](./auto-renewal-d1-d2-contract.md).

Исходные контракты:
[SubscriptionContextPort](../../apps/payments/src/features/payments/application/ports/subscription-context.port.ts),
[SubscriptionPaymentHandler](../../apps/payments/src/features/payments/application/ports/subscription-payment.handler.ts),
[SuccessfulPayment](../../apps/payments/src/features/payments/application/types/successful-payment.types.ts),
[PaymentsTransactionContext](../../apps/payments/src/features/payments/application/ports/payments-unit-of-work.ts),
[адаптер автопродления D1](../../apps/payments/src/features/payments/infrastructure/subscriptions/payments-provider-subscription-auto-renewal.adapter.ts).
