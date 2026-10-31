# Процесс платежа: D1 и D2

**D1 — модуль платежей. D2 — модуль подписок.**

Описание отражает актуальные контракты D1 и адаптированную реализацию D2.
Ручное автопродление реализовано без транспортного API; lifecycle подписок и события доступа
остаются задачами D2. Сквозные проверки после адаптации не запускались.

1. **Создание платежа.**

   Пользователь выбирает тариф и нажимает оплатить.

   **D2:** через `hasActiveSubscription(userId)` сообщает, есть ли действующая подписка.

   ```ts
   abstract class SubscriptionContextPort {
     abstract hasActiveSubscription(userId: number): Promise<boolean>;
   }
   ```

   `true` — подписка есть, `false` — нет. Ошибка чтения пробрасывается.
   D1 использует результат только для выбора CheckoutPurpose.
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

   D1 вызывает метод D2 `applySuccessfulPayment(payment, tx)`.

   Данные, которые D1 передаёт D2 после подтверждения оплаты:

   ```ts
   type SuccessfulPayment = {
     paymentId: string;
     userId: number;
     planId: number;
     type: PaymentType;
     autoRenewalRequested: boolean | null;
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
   Очередь PURCHASE определяется по userId; цель автопродления — по
   provider + providerSubscriptionId.
   `autoRenewalRequested` — намерение при покупке, а не текущее состояние автопродления.

   **D2:** проверяет, не применялся ли этот `paymentId`, и определяет результат:

   | Сценарий               | Действие D2                                                     | `action`    |
   | ---------------------- | ----------------------------------------------------------------- | ----------- |
   | Первая покупка         | Создать первую локальную подписку и оплаченный период             | `CREATED`   |
   | Дополнительная покупка | Запланировать новый период после существующих оплаченных периодов | `SCHEDULED` |
   | Автосписание           | Продлить соответствующую существующую подписку                    | `RENEWED`   |

   Контракт результата D2:

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

     abstract confirmAutoRenewalCancellation(
       paymentId: string,
       providerSubscriptionId: string,
       tx: PaymentsTransactionContext,
     ): Promise<void>;

     abstract bindProviderSubscription(
       paymentId: string,
       providerSubscriptionId: string,
       tx: PaymentsTransactionContext,
     ): Promise<void>;
   }
   ```

   `tx` — непрозрачный для application-слоя контекст текущей транзакции.
   D2 передаёт его своим репозиториям. Транзакцией управляет D1; D2 не завершает её
   самостоятельно и не сохраняет контекст для следующего шага.

   D2 сохраняет изменения подписки и SubscriptionPaymentApplication с неизменяемым результатом.
   Для SCHEDULED дополнительно создаётся AutoRenewalOperation типа TRANSFER со статусом PENDING
   и ID, равным paymentId. Для CREATED/RENEWED операция автопродления не создаётся.
   Старую связь и provider-снимки хранит AutoRenewalOperation; этапов в применении платежа нет.
   D1 записывает возвращённый
   `subscriptionId` в Payment.

   **Изменения D2 и связь `Payment.subscriptionId` фиксируются одной транзакцией.**
   Если этот шаг падает, оба изменения откатываются, но `SUCCEEDED` из шага 3 сохраняется.

   Для `SCHEDULED` D2 также возвращает ID прежней provider-подписки и
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

   **D2:** после подтверждения через `confirmAutoRenewalCancellation`
   фиксирует отключение автопродления старой provider-связи. Она сохраняется для учёта,
   но больше не допускает переключения автопродления.

   В `confirmAutoRenewalCancellation` D1 передаёт:
   `paymentId`, прежний `previousProviderSubscriptionId` как аргумент
   `providerSubscriptionId` и контекст новой локальной транзакции.
   По paymentId D2 находит SCHEDULED-применение и TRANSFER-операцию,
   получает владельца, берёт блокировку пользователя и повторяет чтение.
   Под блокировкой D2 сверяет старый provider ID со снимком операции.
   При PENDING D2 записывает старой подписке RETIRED, операции — BINDING_PENDING.
   BINDING_PENDING и COMPLETED означают повтор без записи после проверки старого provider ID.

   Затем D1 создаёт новую provider-подписку с датой следующего списания,
   рассчитанной D2.

   **D2:** через `bindProviderSubscription` сохраняет новую provider-связь
   и завершает переход. D1 в той же локальной транзакции сохраняет новый
   `Payment.providerSubscriptionId` и помечает webhook обработанным.

   В `bindProviderSubscription` приходят paymentId, новый ID Stripe и tx. Локальную Subscription
   D2 определяет по сохранённому применению и TRANSFER-операции.
   D2 проверяет, что сохранённое применение является SCHEDULED и связано с ожидаемой
   TRANSFER-операцией; входящий локальный ID для этого больше не требуется.
   При BINDING_PENDING D2 атомарно сохраняет новой подписке provider ID и ENABLED,
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

   **Отдельная ответственность D2:** при изменении Business-доступа модуль должен сохранять
   событие в outbox вместе с соответствующим изменением состояния. Доставка события
   в User Accounts обеспечивает обновление типа аккаунта. Эта часть пока не реализована.

**При сбое процесса** DBOS восстанавливает прерванное выполнение по сохранённым шагам;
повторы ошибок выполняются согласно настройкам workflow.
Например, после шага 3 деньги уже подтверждены, а предоставление доступа можно повторить.
Поэтому методы D2 должны быть идемпотентными: повтор того же платежа возвращает
сохранённый результат и не добавляет второй период. Временная ошибка допускает повтор;
ошибка в коде или бизнес-конфликт могут потребовать исправления.

**При очередном автосписании** пользователь checkout не открывает. Stripe присылает
подтверждение оплаты, D1 создаёт Payment типа `RENEWAL`, а D2 продлевает соответствующую
подписку через `applySuccessfulPayment`. Замена provider-подписки из шага 5 не выполняется.

**Вне процесса оплаты D2 отвечает за:** просмотр подписок, окончание периодов,
активацию следующего оплаченного периода и управление автопродлением. При переключении
автопродления D2 сохраняет переходное состояние, вызывает порт D1 после commit
и фиксирует подтверждённый результат. Сам вызов Stripe выполняет D1.

Контракт для переключения автопродления направлен **D2 → D1**:

```ts
type ChangeProviderSubscriptionAutoRenewalParams = {
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
    params: ChangeProviderSubscriptionAutoRenewalParams,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;

  abstract disable(
    params: ChangeProviderSubscriptionAutoRenewalParams,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;
}
```

Порт D2 объявлен в коде. В composition root он связан через `useExisting` с адаптером D1
`PaymentsProviderSubscriptionAutoRenewalAdapter`, который предоставляет `enable` и `disable`
с этими входными и выходными данными.

DBOS workflow ручного изменения один раз устойчиво создаёт AutoRenewalOperation.id и использует его
для всех повторов, в том числе передаёт D1 как autoRenewalChangeId. В Subscription это поле
больше не хранится. Следующее изменение получает новую операцию; клиентский ключ в таблицу
не записывается. Дедупликация запуска и сверка аргументов остаются на уровне workflow.
Ручные use cases и workflow реализованы; HTTP/gRPC API пока не подключён.
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
