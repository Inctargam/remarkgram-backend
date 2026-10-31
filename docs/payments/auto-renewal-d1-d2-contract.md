# Auto-renewal: стык D1 и D2

## Назначение

Документ фиксирует межмодульный контракт изменения auto-renewal для существующей provider
Subscription. Общие границы Payment Module (D1) и Subscription Module (D2), а также приоритет
требований определены в [agent-context.md](./agent-context.md).

Этот контракт не подтверждает оплату, не создаёт `Payment` и не изменяет оплаченный период доступа.
Он только приводит настройку recurring billing у платёжного провайдера к требуемому состоянию.

Ручной workflow, lifecycle и persistence подписок относятся к D2 и не входят в задачи D1.
Ручной workflow реализован; транспортный API и lifecycle worker остаются отдельными задачами D2.

## Ответственность модулей

### D1: Payment Module

D1:

- предоставляет `SetProviderSubscriptionAutoRenewalUseCase`;
- валидирует тип платёжного провайдера;
- преобразует provider-independent запрос в вызов provider API;
- обеспечивает идемпотентность внешнего вызова;
- проверяет, что provider подтвердил нужную Subscription и требуемое состояние;
- возвращает нормализованный результат без Stripe-specific объектов.

D1 не принимает бизнес-решение об auto-renewal, не хранит состояния `ENABLING`, `ENABLED`,
`DISABLING` или `DISABLED` и не изменяет Subscription persistence D2.

### D2: Subscription Module

D2:

- принимает бизнес-решение о включении или отключении auto-renewal;
- проверяет владельца и допустимость перехода Subscription;
- хранит намерение и этап в AutoRenewalOperation, состояние подписки — в Subscription;
- передаёт устойчивый ID операции из DBOS workflow changeSubscriptionAutoRenewalV1 как `autoRenewalChangeId`;
- вызывает D1 только после фиксации переходного состояния;
- организует retry/recovery и подтверждает итоговое состояние после ответа D1.

В Subscription поле autoRenewalChangeId удалено; история хранится в AutoRenewalOperation.
Для ручных ENABLE/DISABLE paymentId и поля source-связи отсутствуют, существующий provider ID
фиксируется при создании. Этапы: PENDING → COMPLETED. ID один раз устойчиво создаёт
DBOS workflow, повтор использует тот же ID. Клиентский ключ идемпотентности в таблице не хранится;
его дедупликация и сверка аргументов относятся к запуску workflow.

Ручное переключение реализовано через EnableSubscriptionAutoRenewalCommand и
DisableSubscriptionAutoRenewalCommand; HTTP/gRPC API пока нет. D1 предоставляет
PaymentsProviderSubscriptionAutoRenewalAdapter. В PaymentsModule D2-порт связан с ним через
useExisting. Use cases D2 не импортируют SetProviderSubscriptionAutoRenewalUseCase напрямую.

## D2 outbound contract

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

Порт объявлен в application-слое D2. Методы enable и disable выражают намерение,
а адаптер D1 делегирует в SetProviderSubscriptionAutoRenewalUseCase с соответствующим boolean.

## Ручной запрос D2

Обе команды получают `{ userId, subscriptionId, idempotencyKey }` и возвращают
`{ operationId, subscriptionId, autoRenewalEnabled }` после завершения workflow.
userId — положительное целое, subscriptionId и idempotencyKey — UUID v4 (регистр нормализуется).
Вызов через CommandBus; при будущем подключении транспорта userId должен приходить из авторизации.

Workflow запускается с ID `subscription-auto-renewal:${userId}:${idempotencyKey}`.
Повтор сравнивает сохранённые userId, subscriptionId и действие. Другое действие или подписка
с тем же ключом дают SubscriptionAutoRenewalIdempotencyConflictError. Новый UUID операции
получается через DBOS.randomUUID внутри workflow; он не равен клиентскому ключу.

Подготовка после общей блокировки сначала проверяет существующую операцию. Для новой операции:

- подписка принадлежит пользователю и последняя по expiresAt;
- provider-привязка существует, RETIRED запрещён;
- у пользователя нет ENABLING/DISABLING, включая перенос автопродления после покупки;
- включение разрешено только до expiresAt; отключение возможно и после окончания доступа;
- будущая PENDING-подписка допускается после binding;
- уже установленное состояние записывается как COMPLETED без изменения подписки и вызова D1.

При обычном переходе сохраняются операция PENDING и ENABLING/DISABLING в одной транзакции.
После ответа D1 подтверждение под lock сохраняет COMPLETED и ENABLED/DISABLED.
Повтор завершённой операции не читает текущее состояние подписки и не меняет его.
Возвращается исторический результат операции, который может отличаться от текущей настройки.

## D1 application contract

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

Текущая реализация контракта:

```ts
SetProviderSubscriptionAutoRenewalUseCase.execute(params);
```

## Входные параметры

| Параметр                 | Тип и допустимые значения                                           | Владелец значения                            | Семантика                                                                                                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider`               | `PaymentProvider`; сейчас только `STRIPE`                           | D2 получает из provider binding Subscription | Провайдер, которому принадлежит указанная provider Subscription. Не выводится из формата идентификатора.                                                                                                    |
| `providerSubscriptionId` | Непустой provider-issued identifier; для Stripe обычно `sub_*`      | Сохранённая provider-связь Subscription      | Идентифицирует ресурс, состояние которого требуется изменить. Это не idempotency key: одна Subscription может проходить несколько последовательных изменений `disable → enable → disable`.                  |
| `autoRenewalEnabled`     | `true` или `false`                                                  | Бизнес-решение D2                            | Desired state у provider. `true` включает следующее автоматическое продление; `false` запрещает следующее автоматическое продление без немедленной отмены уже оплаченного периода.                          |
| `autoRenewalChangeId`    | Непустой opaque string, уникальный для одного логического изменения | D2                                           | Стабильная идентичность запроса. Не меняется при retry/replay одного изменения. Новое, в том числе противоположное, изменение получает новый ID. D1 использует его для построения provider idempotency key. |

`autoRenewalChangeId` описывает бизнес-запрос на изменение, а не технический ключ конкретного SDK.
D1 самостоятельно создаёт Stripe idempotency key:

```text
subscription-auto-renewal:<autoRenewalChangeId>:enable|disable
```

Вызывающая сторона не передаёт готовый `idempotencyKey`, поэтому provider-specific namespace и формат
не выходят за границу D1.

## Provider mapping

Для Stripe используется `Subscription.cancel_at_period_end`:

| `autoRenewalEnabled` | Stripe request               | Значение                                                                              |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `true`               | `cancel_at_period_end=false` | Subscription продолжит автоматически продлеваться в конце текущего периода.           |
| `false`              | `cancel_at_period_end=true`  | Stripe не создаст следующее продление; текущая Subscription не отменяется немедленно. |

D1 не вызывает немедленное удаление Stripe Subscription и не переводит исторический Payment в
`CANCELED` или `FAILED`.

## Результат

| Поле                     | Значение                                                      | Назначение                                                                                                               |
| ------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `providerSubscriptionId` | Идентификатор Subscription из подтверждённого ответа provider | Позволяет вызывающей стороне убедиться, что подтверждён тот же provider resource.                                        |
| `autoRenewalEnabled`     | Фактически подтверждённое provider состояние                  | Должно совпадать с requested `autoRenewalEnabled`. Только после этого вызывающая сторона может подтвердить stable state. |

D1 считает вызов успешным, только если оба поля результата совпадают с запросом. Provider-specific
response, в том числе полный Stripe Subscription object, через application boundary не возвращается.

Пример успешного результата:

```ts
{
  providerSubscriptionId: 'sub_123',
  autoRenewalEnabled: false,
}
```

## Последовательность взаимодействия

```text
D2: business decision
  -> D2 workflow: устойчивый AutoRenewalOperation.id
  -> D2 transaction: AutoRenewalOperation(PENDING) + ENABLING/DISABLING
  -> commit
  -> D2 ProviderSubscriptionAutoRenewalGateway.enable|disable
  -> D1 PaymentsProviderSubscriptionAutoRenewalAdapter
  -> D1 SetProviderSubscriptionAutoRenewalUseCase
  -> D1 PaymentProviderPort
  -> Stripe API                              (без открытой DB-транзакции)
  -> D1 normalized result
  -> D2 transaction: чтение операции под lock + ENABLED/DISABLED + COMPLETED
```

Обе локальные транзакции используют общую блокировку пользователя. Завершённый повтор
возвращает результат операции, не восстанавливая прежнюю настройку поверх последующего изменения.
Новая несовместимая операция не начинается при ENABLING/DISABLING; RETIRED запрещает включение.
Локальные шаги и workflow реализованы; транспортный API остаётся отдельной задачей.

Внешний provider-вызов нельзя выполнять внутри длинной DB-транзакции. Если процесс остановился после
provider success, но до локального подтверждения D2, повтор с тем же `autoRenewalChangeId` и desired
state должен безопасно получить тот же эффект.

## Ошибки и неопределённый исход

- неподдерживаемый `provider` отклоняется D1 и не приводит к provider-вызову;
- несовпадение `providerSubscriptionId` или `autoRenewalEnabled` в provider result считается
  некорректным подтверждением и не должно завершать локальный переход как успешный;
- timeout после отправки запроса означает неопределённый исход, а не доказанный rollback настройки;
- retryable provider/transport failure повторяется с тем же `autoRenewalChangeId`;
- новое бизнес-изменение не переиспользует ID предыдущего изменения;
- поздний результат старого изменения не должен подтверждать более новый локальный переход.

D1 возвращает типизированные ошибки. Внешний DBOS.step повторяет только
PAYMENT_PROVIDER_UNAVAILABLE и PAYMENT_PROVIDER_OUTCOME_UNKNOWN: максимум 10 попыток,
с интервалами 10, 20, ... 2560 секунд. Валидация, несовместимое подтверждение и неизвестные
ошибки не повторяются. Код распознаётся по code/name, без разбора текста провайдера.

Локальные шаги напрямую вызывают runTransaction по образцу Posts. Ошибки БД передаются
datasource без оборачивания, с исходными code/meta/cause. Prisma datasource 4.26.10 сам
повторяет распознанные ошибки сериализации 40001, включая P2034, с задержкой от 1 мс до
2 секунд без лимита числа попыток. Внешнего цикла повторов и durable sleep нет.
runTransaction не оборачивается в DBOS.step. Необработанный сбой локальной транзакции
завершает workflow со статусом ERROR; автоматическое восстановление ERROR пока отсутствует.

JSON-обёртки ошибок нет. Бизнес-ошибки D2 с reason хранят машинный код причины в message,
который сохраняется datasource. В execute небольшой mapper восстанавливает их классы по name
и обрабатывает исчерпание попыток внешнего step. Неизвестная ошибка на application-границе
становится безопасной SubscriptionAutoRenewalFailedError; сырой SQL/provider-текст не выдаётся
вызывающему коду и не попадает в диагностический лог D2. Это не меняет хранение ошибок самим DBOS.
При recovery прерванного выполнения успешный provider step читается из checkpoint без нового
вызова. Это не означает автоматического повторного запуска workflow, завершившегося с ERROR.

Если подготовка уже зафиксирована, а завершить процесс не удалось, операция остаётся PENDING,
подписка — ENABLING/DISABLING. Workflow возвращает сохранённую ошибку и пишет безопасный лог
с operationId/workflowId. Повтор клиентского ключа получает ту же ошибку, новый ключ не снимает
блокировку. Восстановление зависших операций — отдельная задача; rollback настройки провайдера
и автоматическая разблокировка не реализованы.

Workflow ручного автопродления ещё не использовался: упрощена текущая V1 без legacy-версии.
История БД не удаляется; схема и публичные контракты D1 не изменены.

## Связь с `Payment.autoRenewalRequested`

`Payment.autoRenewalRequested` — неизменяемый снимок пользовательского намерения в момент покупки.
Он не является текущим состоянием auto-renewal и не заменяет этот контракт.

```text
Payment.autoRenewalRequested  = историческое намерение покупки
D2 auto-renewal state         = текущее локальное lifecycle state
provider result               = подтверждённая настройка provider Subscription
```

Последующие enable/disable операции не изменяют `Payment.autoRenewalRequested`.

## Минимальные сценарии приемки стыка

- enable преобразуется в Stripe `cancel_at_period_end=false`;
- disable преобразуется в Stripe `cancel_at_period_end=true`;
- replay с тем же `autoRenewalChangeId` не создаёт новую логическую операцию;
- новое изменение той же Subscription использует новый `autoRenewalChangeId`;
- ответ с другим `providerSubscriptionId` отклоняется;
- ответ с противоположным `autoRenewalEnabled` отклоняется;
- provider timeout не подтверждает stable state;
- provider-вызов выполняется без открытой DB-транзакции;
- поздний результат старого изменения не перезаписывает более новое решение.

## Проверки реализации

Добавлены unit-сценарии команд, локальных шагов, репозитория, workflow и сериализации ошибок.
PostgreSQL-сценарии проверяют rollback, конкурирующие команды, блокирование применения платежа
и поздний повтор после противоположного изменения. Они требуют отдельной тестовой базы с
применённой схемой через PAYMENTS_INTEGRATION_DATABASE_URL; тест не применяет миграции.
Проверки не запускались. HTTP/gRPC, восстановление зависших операций и новый lifecycle worker
в эту задачу не входят.
