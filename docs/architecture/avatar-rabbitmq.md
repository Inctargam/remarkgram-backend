# RabbitMQ: события user-accounts и удаление аватара

## Подключение и запуск

Нужен **RabbitMQ 4.3+**: отложенные повторы quorum-очередей появились в этой версии.
В `.env` user-accounts и Files заполнить `AMQPS_URL` — AMQP/AMQPS URL одного virtual host,
например `amqps://username:password@broker.example.com/vhost`. URL панели управления не подходит.
Спецсимволы кодируются для URL; для vhost `/` путь — `/%2F`.
Достаточно прав configure/write/read на объекты своего vhost. Учётные данные Management API,
администратор брокера, импорт JSON и ручное создание объектов не нужны.

1. Запустить Files: он создаст exchanges, основную очередь, DLQ и bindings.
2. В RabbitMQ Manager проверить **Queues and Streams**: обе очереди имеют тип **quorum**,
   у основной очереди есть consumer, а в **Arguments** указаны параметры из таблицы ниже.
3. Запустить user-accounts и Gateway.

Настройка находится в двух местах:

- [RmqIntegrationEventPublisher](../../apps/user-accounts/src/features/outbox/infrastructure/rmq/rmq-integration-event.publisher.ts)
  объявляет `user_accounts_exchange` в `setup` своего канала.
- [AvatarDeletionRmqServer](../../apps/files/src/infrastructure/rmq/avatar-deletion.rmq-server.ts)
  расширяет стандартный Nest `ServerRMQ` только методом настройки канала. Последовательные
  `assertExchange`, `assertQueue` и `bindQueue` создают топологию, затем `super.setupChannel`
  запускает обычный Nest consumer с `noAck: false` и `prefetchCount: 1`.

Оба сервиса объявляют общий exchange одинаково, поэтому порядок их подключения не вызывает
конфликтов. После переподключения объявления повторяются и восстанавливают отсутствующие bindings.
При первом запуске нужен Files, чтобы появилась его подписка: если user-accounts отправит событие
раньше и других подписчиков нет, `mandatory` вернёт сообщение, а outbox сохранит его для повтора.
Резервная отправка может ждать шестичасового прохода. Если другой подписчик уже есть,
`mandatory` не обнаружит отсутствие именно Files — поэтому Files запускается первым.
Топология Posts не изменена.

## Топология и повторы

| Обменник                         | Тип    | Routing key                          | Очередь                            |
| -------------------------------- | ------ | ------------------------------------ | ---------------------------------- |
| `user_accounts_exchange`         | topic  | `files.avatar-deletion-requested.v1` | `files_avatar_deletion_queue`      |
| `files_avatar_deletion_exchange` | direct | `main`                               | `files_avatar_deletion_queue`      |
| `files_avatar_deletion_exchange` | direct | `dead`                               | `files_avatar_deletion_dead_queue` |

Все объекты durable, без auto-delete. Обе очереди — quorum. Отдельной retry-очереди нет:
брокер удерживает сообщение внутри основной очереди до следующей доставки.
Ключ `main` нужен для ручного повтора из DLQ без повторной рассылки другим подписчикам.

Аргументы основной очереди (`arguments` в `assertQueue`):

| Параметр                    | Значение                         | Назначение                                             |
| --------------------------- | -------------------------------- | ------------------------------------------------------ |
| `x-delivery-limit`          | `3`                              | До трёх повторных доставок после первой попытки        |
| `x-delayed-retry-type`      | `failed`                         | Задерживать сообщения после неудачной доставки         |
| `x-delayed-retry-min`       | `60000`                          | Минимальная задержка в миллисекундах                   |
| `x-delayed-retry-max`       | `60000`                          | Фиксированная минутная задержка вместо её увеличения   |
| `x-dead-letter-exchange`    | `files_avatar_deletion_exchange` | Обменник для переноса в DLQ                            |
| `x-dead-letter-routing-key` | `dead`                           | Маршрут DLQ                                            |
| `x-dead-letter-strategy`    | `at-least-once`                  | Удерживать сообщение до подтверждённого переноса в DLQ |
| `x-overflow`                | `reject-publish`                 | Необходим для подтверждённого dead-lettering           |

При недоступности DLQ или отсутствии маршрута брокер повторяет перенос сам. Ожидающие переноса
сообщения занимают место в основной очереди; лимиты хостинга по-прежнему действуют.
После восстановления маршрута перенос может ждать следующей внутренней попытки брокера
(по умолчанию около 3 минут). Это отдельный интервал, не минутная задержка обработки Files.
[Quorum delayed retry](https://www.rabbitmq.com/docs/quorum-queues#delayed-retry),
[подтверждённый dead-lettering](https://www.rabbitmq.com/docs/quorum-queues#activating-at-least-once-dead-lettering).

## Обработчик Files

[AvatarDeletionEventConsumer](../../apps/files/src/presentation/messaging/avatar-deletion-event.consumer.ts)
проверяет событие и вызывает `ScheduleAttachedFileDeletionUseCase`:

- Успех: `ack` только после сохранения `FileDeletionJob`, затем фоновый запуск удаления из S3.
- Некорректное сообщение или конфликт состояния файла: `reject(message, false)` — сразу в DLQ.
- Техническая ошибка сохранения: `reject(message, true)` — повтор по настройкам quorum-очереди.

Именно `reject`, а не `nack` с requeue: в RabbitMQ 4.3 `reject` увеличивает `delivery-count`,
а `nack` с requeue — нет. Неизвестный Nest pattern стандартный обработчик Nest отклоняет
без requeue, поэтому такое сообщение тоже попадает в DLQ.

Ручных `shouldRetry`, `x-retry-count`, таймеров и перепубликации в Files больше нет.
Брокер ведёт счётчик `x-delivery-count`; потеря соединения с неподтверждённым сообщением тоже
расходует лимит. Четыре вызова обработчика гарантируются только для обычной последовательности
«ошибка → reject», а не при произвольных сбоях соединения.
[Правила подсчёта доставок](https://www.rabbitmq.com/docs/quorum-queues#poison-message-handling).

После commit, но до ack процесс может упасть: повторная постановка удаления безопасна благодаря
идемпотентности Files. Ошибки S3 обрабатывает существующий worker `FileDeletionJob`, не RabbitMQ.

Текст ошибки приложения теперь остаётся в логах Files с `eventId` — заголовок `x-last-error`
больше не записывается, поскольку Files не перепубликует сообщение. В DLQ брокер добавляет
`x-death`: `rejected` при постоянной ошибке или `delivery_limit` при исчерпании повторов.
Для некорректных сообщений без валидного `eventId` ориентироваться на тело и время записи в логах.

```mermaid
flowchart LR
    O[Outbox] --> E[user_accounts_exchange]
    E --> Q[Quorum: files_avatar_deletion_queue]
    Q --> F[Files]
    F -->|Commit, затем ack| J[FileDeletionJob → S3]
    F -->|reject с requeue| Q
    Q -->|Пауза 60 секунд, до 3 повторов| F
    Q -->|Лимит или reject без requeue| D[Quorum DLQ]
```

## Публикация и независимые подписчики

Publisher user-accounts отправляет событие в `user_accounts_exchange`, routing key — `event.eventType`.
Тело Nest: `{ "pattern": "<eventType>", "data": { ...событие } }`. Используются persistent-сообщения,
`messageId = eventId`, confirm и `mandatory: true`, таймаут — 5 секунд.
Технический `correlationId` отличает параллельные и запоздавшие попытки одного события.
Confirm без маршрута не считается успехом: publisher также проверяет `basic.return`.
[Publisher confirms](https://www.rabbitmq.com/docs/confirms).

Другой независимый подписчик получает отдельную очередь с binding на topic-обменник;
реплики одного подписчика читают одну очередь и делят работу. Повторы Files остаются внутри
его очереди. `mandatory` обнаруживает отсутствие всех маршрутов, но не каждого ожидаемого подписчика.

Outbox user-accounts сохраняется: ошибка публикации оставляет событие неопубликованным с `lastError`.
Попытки не ограничены, отправка после commit немедленная, резервный проход — при старте и каждые
6 часов. Это отдельный механизм от повторов обработки в Files. `publishedAt` означает публикацию,
а не удаление файла. После потери confirm или сбоя commit возможен дубль с прежним `eventId`.

## Панель и ручной повтор

- **Consumers** — экземпляры Files на основной очереди; DLQ не требует consumer.
- **Ready** — сообщения, готовые к выдаче; отложенные доставки смотреть также в статистике delayed/deferred.
- **Unacked** — выданные, но ещё не подтверждённые сообщения.
- В DLQ смотреть тело, `message_id`, `x-death`; подробную ошибку искать в логах Files по `eventId`.

Для проверки остановить Files, удалить аватар: профиль пуст, сообщение накапливается в основной
очереди. Запустить Files — сообщение обрабатывается. Ошибки и исчерпание лимита безопаснее
проверять на изолированном брокере интеграционными тестами.

Ручной повтор:

1. Устранить причину ошибки.
2. В DLQ через **Get messages** с requeue прочитать и сохранить исходное тело Nest целиком.
3. В **Exchanges → files_avatar_deletion_exchange → Publish message** выбрать ключ `main`,
   вставить тело, указать `delivery_mode: 2`, `content_type: application/json` и прежний `message_id`.
   Сохранить `data.eventId`. Заголовки `x-death`, `x-delivery-count`, `x-acquired-count` и старые
   `x-retry-count`/`x-last-error` не переносить: это новая публикация с новым счётчиком брокера.
4. Проверить обработку, затем удалить только исходное сообщение из DLQ через Get без requeue,
   сверив `eventId`. Не использовать Purge для удаления одного сообщения. Если порядок изменился,
   чужие сообщения вернуть в очередь. Для массового повтора лучше отдельный инструмент.

## Обновление топологии

Очереди в текущем окружении ещё не создавались: первый запуск Files создаст их с нужными аргументами.
Повторное объявление с теми же параметрами сохраняет сообщения. Несколько реплик Files могут
безопасно объявлять одинаковую топологию.

Аргументы очереди заданы в коде, а не через policy. При изменении неизменяемых параметров
существующей очереди RabbitMQ отклонит несовместимое объявление (`PRECONDITION_FAILED`).
Нельзя просто удалить очередь с сообщениями: сначала остановить отправителей и обработать
или перенести сообщения, затем пересоздать пустую очередь либо перейти на новое имя.
Приложение само очереди не удаляет. На shared-хостинге могут действовать ограничения провайдера.

На одном узле quorum не обеспечивает защиту от потери узла/диска; репликация и доступность
зависят от фактического числа узлов и реплик у провайдера.

## Проверки разработчика

Интеграционные тесты требуют **RabbitMQ 4.3+**, создают отдельный vhost и обычного пользователя без административных тегов.
Реальные publisher и Nest consumer сами объявляют топологию через AMQP; задержка сокращена до 100 мс.
Management API нужен только тестовому стенду для изоляции, проверки настроек и отключения соединений.
Тестовый пользователь должен уметь создавать/удалять vhost и назначать permissions.
Использовать только локальные/изолированные сервисы:

```sh
AVATAR_RABBITMQ_TEST_URL=amqp://guest:guest@localhost:5672 \
AVATAR_RABBITMQ_MANAGEMENT_URL=http://guest:guest@localhost:15672 \
AVATAR_INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:5432/postgres \
  pnpm exec vitest run apps/user-accounts/test/integration/avatar-rabbitmq.integration.spec.ts \
  apps/user-accounts/test/integration/outbox.integration.spec.ts
```

HTTP/gRPC, workflow, миграции БД, outbox, FileDeletionJob и поток Posts этим переходом не меняются.
