# Auto-renewal: стык D1 и D2

## Назначение

Документ фиксирует межмодульный контракт изменения auto-renewal для существующей provider
Subscription. Общие границы Payment Module (D1) и Subscription Module (D2), а также приоритет
требований определены в [agent-context.md](./agent-context.md).

Этот контракт не подтверждает оплату, не создаёт `Payment` и не изменяет оплаченный период доступа.
Он только приводит настройку recurring billing у платёжного провайдера к требуемому состоянию.

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
- хранит desired и фактическое локальное состояние;
- создаёт идентификатор изменения `autoRenewalChangeId`;
- вызывает D1 только после фиксации переходного состояния;
- организует retry/recovery и подтверждает итоговое состояние после ответа D1.

Реальный D2 application boundary пока не реализован. D1 предоставляет готовый
`PaymentsProviderSubscriptionAutoRenewalAdapter`, зарегистрированный и экспортированный из
`PaymentsModule` по class token. D2 use cases не должны импортировать
`SetProviderSubscriptionAutoRenewalUseCase` напрямую.

## D2 outbound contract

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

interface ProviderSubscriptionAutoRenewalGateway {
  abstract enable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;

  abstract disable(
    command: ChangeProviderSubscriptionAutoRenewalCommand,
  ): Promise<ChangeProviderSubscriptionAutoRenewalResult>;
}
```

Этот интерфейс является описанием будущей границы, а не текущим файлом в `features/subscriptions`.
Когда D2 будет реализован, он должен объявить такой port в собственном application-слое и выбрать
собственный injection token. Composition root свяжет этот token с экспортированным
`PaymentsProviderSubscriptionAutoRenewalAdapter`. Методы `enable` и `disable` выражают намерение D2
без boolean-флага, а adapter делегирует соответственно в
`SetProviderSubscriptionAutoRenewalUseCase.execute({ autoRenewalEnabled: true|false })`.

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
  -> D2 transaction: desired state + ENABLING/DISABLING + autoRenewalChangeId
  -> commit
  -> D2 ProviderSubscriptionAutoRenewalGateway.enable|disable
  -> D1 PaymentsProviderSubscriptionAutoRenewalAdapter
  -> D1 SetProviderSubscriptionAutoRenewalUseCase
  -> D1 PaymentProviderPort
  -> Stripe API                              (без открытой DB-транзакции)
  -> D1 normalized result
  -> D2 transaction: сверка change ID и подтверждение ENABLED/DISABLED
```

Внешний provider-вызов нельзя выполнять внутри длинной DB-транзакции. Если процесс завершился после
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

Текущий D1 use case пробрасывает provider errors и выбрасывает ошибку при несовместимом результате.
До интеграции с D2 необходимо согласовать типизированную классификацию retryable, terminal и unknown
outcomes; нельзя выводить эту классификацию из текста исключения.

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
