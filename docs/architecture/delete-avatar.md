# Удаление аватара: от HTTP до S3

## Что делает фронтенд

Показать `Do you really want to delete your profile photo?`. При No или закрытии ничего
не отправлять. При Yes создать UUID v4 и выполнить запрос без тела:

```http
DELETE /api/v1/users/me/profile/avatar
Authorization: Bearer <accessToken>
Idempotency-Key: 22222222-2222-4222-8222-222222222222
```

После `204` убрать фотографию из интерфейса. Профиль уже содержит `avatarFileId: null`;
переход на другую страницу, WebSocket, SSE и опрос состояния не требуются.
При потере ответа повторить тот же ключ. Новый ключ означает новое действие пользователя.
Старый ключ не удалит аватар, установленный после первого удаления.

`400` — неверный/отсутствующий ключ, `401` — нет авторизации, `404` — нет активного пользователя,
`409` — выполняется установка аватара. Отсутствующий профиль/аватар — `204`.

## Синхронная часть

Gateway берёт userId из токена и вызывает `UsersService.DeleteAvatar`. `DeleteAvatarUseCase`
запускает одну транзакцию `UnitOfWork`:

1. Через `UsersRepository.lockActiveById` блокирует активного пользователя, как SetAvatar: Profile может отсутствовать.
2. Через `AvatarDeletionRequestsRepository.exists` проверяет выполненный ключ; повтор завершает запрос без изменений.
3. Через `UsersRepository.clearAvatar` проверяет отсутствие активного `avatarUpdateId` и очищает только `avatarFileId`, получая прежний ID. При активной установке возвращается конфликт.
4. Через `AvatarDeletionRequestsRepository.add` сохраняет выполненный ключ, даже если аватара не было.
5. Через `OutboxEventsRepository.add` сохраняет событие удаления прежнего файла в `outbox_events`, если файл был.

Все изменения фиксируются вместе. Ошибка постановки задачи откатывает и профиль, и выполненный ключ.
Новый `avatarUpdateId` не нужен. DBOS в DELETE не участвует. Записи ключей пока хранятся без очистки:
удаление истории означало бы прекращение защиты от старых повторных запросов.

Сообщение содержит ID и тип события, сведения об агрегате и данные для удаления:

```json
{
  "eventId": "<UUID сообщения>",
  "eventType": "files.avatar-deletion-requested.v1",
  "aggregateType": "user",
  "aggregateId": "42",
  "data": { "userId": 42, "fileId": "<UUID файла>" }
}
```

## Асинхронная часть

```mermaid
sequenceDiagram
    participant UA as user-accounts
    participant DB as PostgreSQL / outbox_events
    participant RMQ as RabbitMQ
    participant Files
    participant S3
    UA->>DB: Транзакция: очистить avatarFileId + событие + ключ запроса
    DB-->>UA: commit
    Note over UA: HTTP 204, без ожидания брокера
    UA->>UA: Фоновый worker.publish(eventId)
    UA->>DB: Транзакция: SELECT FOR UPDATE SKIP LOCKED
    UA->>RMQ: Публикация сообщения
    RMQ-->>UA: publisher confirm
    UA->>DB: Записать publishedAt, commit
    RMQ->>Files: Доставка сообщения
    Files->>Files: Транзакция: soft delete + FileDeletionJob
    Files-->>RMQ: ack
    Files->>S3: Фоновое удаление объекта
```

Outbox общий для всего микросервиса user-accounts и расположен в `src/features/outbox`.
`OutboxEventsRepository`, `OutboxWorker` и `OutboxScheduler` работают с `IntegrationEvent`,
поэтому разные use case сохраняют события в одну таблицу `outbox_events`.
Фабрика события удаления аватара остаётся в feature users.

`RmqIntegrationEventPublisher` отправляет события в topic-обменник `user_accounts_exchange`,
routing key равен `eventType`. Подписчики создают свои очереди и bindings. Для Files используется
`files_avatar_deletion_queue`. Новому типу события не нужен новый клиент в user-accounts.
Отсутствие всех маршрутов и ошибки подтверждения оставляют событие в outbox с `lastError`.
Подробности настройки, повторов и DLQ: [RabbitMQ для аватаров](avatar-rabbitmq.md).

`OutboxEvent` хранит ID события, тип, `aggregateType`, `aggregateId`, бизнес-данные `{ userId, fileId }`, время создания,
время публикации и последнюю ошибку.
В БД сведения об агрегате хранятся в `aggregate_type` и `aggregate_id`. Для удаления аватара
это `user` и строковое представление userId. ID файла остаётся в payload: он указывает,
какой объект удалить. `aggregateId` — строка, чтобы общий outbox поддерживал и числовые ID, и UUID.

`AvatarDeletionRequest` — отдельный журнал повторов
HTTP-запроса, он не отвечает за доставку сообщения.

После commit use case запускает `void worker.publish(eventId)`. Это отправка конкретного события,
не полный проход outbox. Метод перехватывает и логирует свои ошибки: они не откатывают профиль
и не меняют успешный HTTP-ответ. Если процесс упадёт до отправки, событие уже находится в БД.

`publish` открывает отдельную транзакцию и читает неопубликованную строку с
`FOR UPDATE SKIP LOCKED`. Занятые другим worker, отсутствующие и опубликованные строки пропускаются.
Блокировка удерживается до подтверждения брокера и записи `publishedAt`. Это короткая транзакция
outbox, а не транзакция изменения профиля: публикация ограничена 5 секундами, транзакция — 10.
Несколько экземпляров приложения могут читать outbox, но не публикуют одну заблокированную строку
одновременно. Lease и выбор лидера не используются.

При ошибке публикации worker сохраняет `lastError`, оставляя `publishedAt = null`.
Ошибка не означает удаление или окончательное отклонение записи. При сбое самой транзакции
изменения откатываются, ошибка попадает в лог, а событие остаётся доступным для повтора.
После успешной отправки `lastError` очищается.

Повторы возможны: брокер мог принять сообщение, а процесс — упасть до фиксации `publishedAt`.
`eventId` сохраняется при каждой попытке. Files безопасно повторяет постановку удаления:
проверяет владельца и статус и создаёт единственный `FileDeletionJob`.

Очередь RabbitMQ — `files_avatar_deletion_queue`, durable, сообщения persistent.
Она подписана на topic-обменник `user_accounts_exchange`. При подключении Files сам объявляет exchanges,
quorum-очереди и bindings в [AvatarDeletionRmqServer](../../apps/files/src/infrastructure/rmq/avatar-deletion.rmq-server.ts),
затем запускает стандартную обработку сообщений Nest. Параметры повторов и DLQ заданы аргументами очереди;
импорт JSON и Management API не нужны.
В Files используются `noAck: false` и `prefetchCount: 1`. Consumer подтверждает сообщение только
после сохранения задачи удаления, затем запускает worker физического удаления в фоне.
Некорректные сообщения и неподходящее состояние файла отправляются в DLQ;
техническая ошибка сохранения возвращает сообщение в quorum-очередь: RabbitMQ 4.3+ сам выполняет до трёх повторов с задержкой 60 секунд, затем переносит сообщение в DLQ. Расписание FileDeletionJob не изменено.

## Обход, повторы и хранение

`OutboxScheduler` запускает фоновый проход при старте приложения и по
`CronExpression.EVERY_6_HOURS` с `waitForCompletion: true`. Плановый запуск происходит в 00:00,
06:00, 12:00 и 18:00 по часовому поясу процесса. Повторы не ограничены по количеству.
После сбоя ближайшая резервная отправка может ждать до 6 часов; это не срок удаления из S3.

`worker.run()` фиксирует верхнюю границу времени создания и читает до 100 неопубликованных
записей, упорядоченных по `(createdAt, id)`. Публикация последовательная, через `for…of`.
После страницы курсором становятся дата и ID её последней записи. Следующая страница начинается
строго после этих значений. ID разрешает совпадение дат; уже опубликованная строка курсора не нужна.

Курсор продвигается и после неудачной отправки, чтобы ошибка одной записи не зациклила проход.
В следующем проходе курсор снова пустой: строка с ошибкой попадёт в выборку, пока `publishedAt = null`.
Новые события отправляются сразу по ID; события за верхней границей подхватит следующий проход.

После прохода scheduler удаляет опубликованные записи старше 30 дней с момента публикации.
Неопубликованные события не удаляются независимо от возраста и количества ошибок.

Посмотреть состояние доставки:

```sql
SELECT id, event_type, aggregate_type, aggregate_id, payload, created_at, published_at, last_error
FROM outbox_events
WHERE published_at IS NULL
ORDER BY created_at, id;
```

После устранения причины ошибки достаточно следующего прохода scheduler или перезапуска сервиса.
Отдельной команды повторного запуска и статуса `failed` нет. `publishedAt` означает подтверждение
RabbitMQ, а не завершение удаления файла в S3.

## Замена аватара через SetAvatar

DBOS сохраняется. В `updateAvatarAndScheduleDeletion` новый avatarFileId и событие удаления прежнего файла
записываются через клиент одной транзакции Prisma datasource вместе с checkpoint. Результат —
объект `{ deletionEventId }`, где значение равно null при первой установке. Следующий отдельный шаг запускает
`worker.publish(eventId)` в фоне. Повтор безопасен: опубликованная запись пропускается.
`scheduleNewAvatarDeletion` используется только для компенсации нового файла после удаления пользователя.
Запись нового аватара и снятие блокировки остаются отдельными транзакциями.
Недоступность брокера не мешает завершению после сохранения события. Posts не изменён.

## Первое подключение RabbitMQ

Заполнить `AMQPS_URL` в user-accounts и Files одним virtual host. Запустить Files, затем user-accounts: обменники, очереди и bindings создаются автоматически из кода.
Проверка доставки, разбор ошибок и ручной повтор описаны в
[инструкции RabbitMQ](avatar-rabbitmq.md). Импорт через панель не требуется.

## Развёртывание и проверки

Объединение записи профиля и outbox меняет последовательность шагов `setAvatarV1`.
Реальных запусков прежней последовательности ещё не было; совместимость со старой историей
не реализована. Использовать новую последовательность только без незавершённых старых workflow;
одноразовые тестовые БД создаются заново.
Применить миграции user-accounts, включая `20260925120000_avatar_deletion_outbox`, затем
запустить обновлённый Files и затем user-accounts. Контракты Files и Gateway не меняются.
`AvatarDeletionRequest` и его существующая миграция сохраняются.

Перенос задач pg-boss не предусмотрен: перед переходом предполагается отсутствие задач,
которые требуется сохранить. Старая схема `pgboss` автоматически не удаляется, новый код её не использует.
Outbox использует существующий `DATABASE_URL` и Prisma-пул. Новых настроек окружения не требуется.
Системная БД DBOS по-прежнему требует direct/session-pooled URL; DBOS останавливается до Prisma.

Интеграционные тесты создают и удаляют отдельные PostgreSQL-базы. Не указывать рабочую БД:

```sh
pnpm build:files
pnpm build:user-accounts
AVATAR_INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:5432/postgres \
  pnpm exec vitest run apps/user-accounts/test/integration/set-avatar.integration.spec.ts \
  apps/user-accounts/test/integration/outbox.integration.spec.ts
AVATAR_INTEGRATION_DATABASE_URL=postgresql://postgres@localhost:5432/postgres \
AVATAR_RABBITMQ_TEST_URL=amqp://guest:guest@localhost:5672 \
AVATAR_RABBITMQ_MANAGEMENT_URL=http://guest:guest@localhost:15672 \
  pnpm exec vitest run apps/user-accounts/test/integration/avatar-rabbitmq.integration.spec.ts
```

Проверяются откаты, повтор ключа DELETE после новой установки, конкуренция, подтверждение публикации,
ошибки отдельных событий, курсор, несколько worker, повторы без лимита, очистка истории,
освобождение блокировки после обрыва соединения и SIGKILL с восстановлением checkpoint DBOS.
