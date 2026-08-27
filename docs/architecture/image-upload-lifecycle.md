# Жизненный цикл изображений и создание поста

Документ описывает текущие сценарии загрузки изображений и создания поста через DBOS.
Диаграммы отражают состояние кода, а не целевую архитектуру.

## Загрузка и подтверждение изображений

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь
    participant Frontend
    participant Gateway as API Gateway
    participant Files as Files service
    participant FilesDB as Files DB
    participant S3 as Yandex Object Storage

    User->>Frontend: Выбирает 1–10 изображений
    Frontend->>Frontend: Проверяет JPEG/PNG и размер до 20 МБ
    Frontend->>Gateway: POST /api/v1/files/image-uploads<br/>метаданные и clientFileId
    Gateway->>Files: InitiateImageUploads (gRPC)
    Files->>Files: Проверяет userId, количество,<br/>размер, Content-Type и clientFileId

    loop Для каждого изображения
        Files->>S3: Создать presigned POST
        S3-->>Files: url, fields, expiresAt
    end

    Files->>FilesDB: Создать File со статусом PENDING<br/>и сохранить uploadExpiresAt
    Files-->>Gateway: Upload sessions: id, clientFileId, url, fields
    Gateway-->>Frontend: 201 Created

    loop Для каждой upload session
        Frontend->>S3: multipart/form-data по presigned POST
        S3-->>Frontend: Результат загрузки
    end

    Frontend->>Gateway: POST /api/v1/files/image-uploads/complete<br/>uploadIds
    Gateway->>Files: CompleteImageUploads (gRPC)
    Files->>FilesDB: Найти файлы пользователя по uploadIds

    alt Все записи уже COMPLETED
        Note over Files: Идемпотентный повтор подтверждения
        Files-->>Gateway: Успех
    else Весь набор находится в PENDING
        par Для каждого файла
            Files->>S3: HeadObject(objectKey)
            S3-->>Files: Content-Length и Content-Type<br/>или объект не найден
        end

        alt Все объекты существуют и метаданные совпали
            Files->>FilesDB: Атомарно PENDING → COMPLETED<br/>и установить uploadedAt
            Files-->>Gateway: Успех
        else Хотя бы один объект отсутствует<br/>или метаданные не совпали
            Files->>FilesDB: Атомарно весь набор PENDING → REJECTED
            Files-->>S3: Best-effort DeleteObject без ожидания клиентом
            Note over Files,FilesDB: Если удаление не удалось,<br/>его повторит фоновая очистка
            Files-->>Gateway: Ошибка метаданных
        end
    else Найден другой или смешанный статус
        Files-->>Gateway: Ошибка состояния загрузок
    end

    Gateway-->>Frontend: 204 No Content или HTTP-ошибка
```

## Создание поста с DBOS

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь
    participant Frontend
    participant Gateway as API Gateway
    participant Posts as Posts service
    participant DBOS
    participant PostsDB as Posts DB + DBOS tables
    participant Files as Files service
    participant FilesDB as Files DB

    User->>Frontend: Нажимает Publish
    Frontend->>Gateway: POST /api/v1/posts<br/>Idempotency-Key, description, imageIds
    Gateway->>Posts: CreatePost (gRPC)
    Posts->>Posts: Проверить бизнес-инварианты<br/>и вычислить requestHash
    Posts->>DBOS: startWorkflow(createPostV1, workflowID)
    DBOS->>PostsDB: Найти или зарегистрировать workflow

    alt Тот же workflowID, но другой requestHash
        DBOS-->>Posts: Сохранённый input не совпадает
        Posts-->>Gateway: Idempotency conflict
        Gateway-->>Frontend: 409 Conflict
    else Новый workflow или точный повтор
        Note over DBOS: Повтор получает handle того же workflow<br/>и использует сохранённые checkpoints
        DBOS->>DBOS: DBOS.randomUUID()<br/>стабильный reservationId

        rect rgb(235, 245, 255)
            Note over DBOS,FilesDB: Durable step: reserveImages
            DBOS->>Files: ReserveImageUploads (gRPC)
            Files->>FilesDB: В одной транзакции создать Reservation<br/>и перевести COMPLETED → RESERVED
            Note over Files,FilesDB: Точный повтор с тем же reservationId<br/>возвращает успех
            Files-->>DBOS: Резерв создан
        end

        rect rgb(245, 240, 255)
            Note over DBOS,PostsDB: DBOS-транзакция createUnpublishedPost
            DBOS->>PostsDB: Создать Post(publishedAt = NULL)<br/>и упорядоченные PostImage
            Note over DBOS,PostsDB: Изменение Posts и DBOS-checkpoint<br/>фиксируются атомарно
        end

        rect rgb(235, 245, 255)
            Note over DBOS,FilesDB: Durable step: attachImages
            DBOS->>Files: AttachReservedImageUploads (gRPC)
            Files->>FilesDB: В одной транзакции Reservation и File:<br/>RESERVED → ATTACHED
            Files-->>DBOS: Изображения прикреплены
        end

        rect rgb(245, 240, 255)
            Note over DBOS,PostsDB: DBOS-транзакция publishPost
            DBOS->>PostsDB: Установить Post.publishedAt
        end

        DBOS-->>Posts: { id: postId }
        Posts-->>Gateway: { id: postId }
        Gateway-->>Frontend: 201 Created
        Frontend-->>User: Показать опубликованный пост
    end
```

### Компенсации и восстановление создания поста

- Если создание `Post` завершается известным конфликтом после резерва, DBOS выполняет durable
  `releaseReservation`: `RESERVED → COMPLETED`.
- Если `attachImages` возвращает известную бизнес-ошибку, DBOS освобождает резерв и удаляет
  неопубликованный `Post`.
- Неизвестная инфраструктурная ошибка не запускает слепую компенсацию. Workflow сохраняется для
  диагностики и восстановления, а `Post` с `publishedAt = NULL` не виден читателям.
- После падения процесса DBOS продолжает workflow с последнего checkpoint. Повтор gRPC-шага
  безопасен благодаря стабильному `reservationId` и идемпотентным операциям Files.
- Повтор HTTP-запроса с тем же `Idempotency-Key` получает результат того же workflow. Тот же ключ
  с другим содержимым запроса возвращает `409 Conflict`.

## Состояния File

`PENDING`, `COMPLETED`, `REJECTED`, `RESERVED` и `ATTACHED` — значения `File.uploadStatus`.
Состояние `DELETION_CLAIMED` на диаграмме обозначает запись с заполненным `deletedAt`, а не
дополнительное значение enum.

```mermaid
stateDiagram-v2
    [*] --> PENDING: Созданы File и presigned POST

    PENDING --> COMPLETED: CompleteImageUploads<br/>объект найден, метаданные совпали
    PENDING --> REJECTED: CompleteImageUploads<br/>объект отсутствует или метаданные не совпали

    COMPLETED --> RESERVED: ReserveImageUploads<br/>создана ImageUploadReservation
    RESERVED --> ATTACHED: AttachReservedImageUploads
    RESERVED --> COMPLETED: ReleaseReservedImageUploads<br/>reservationId очищен

    state "Удаление захвачено<br/>deletedAt != NULL" as DELETION_CLAIMED

    PENDING --> DELETION_CLAIMED: Истёк uploadExpiresAt<br/>с учётом grace period
    REJECTED --> [*]: Успешная немедленная очистка
    REJECTED --> DELETION_CLAIMED: Немедленная очистка не удалась<br/>и истёк grace period
    COMPLETED --> DELETION_CLAIMED: Не использован 24 часа
    ATTACHED --> DELETION_CLAIMED: Получено событие удаления поста<br/>и выполнен soft delete файла

    DELETION_CLAIMED --> [*]: DeleteObject выполнен<br/>запись File удалена
    DELETION_CLAIMED --> DELETION_CLAIMED: Ошибка удаления<br/>повтор после timeout

    note right of RESERVED
        RESERVED не очищается по TTL.
        Незавершённый сценарий создания поста
        восстанавливает DBOS workflow.
    end note

    note right of ATTACHED
        ATTACHED не участвует в очистке
        неиспользованных загрузок.
        Удаление начинается после события
        об удалении опубликованного поста.
    end note
```

## Связь File и ImageUploadReservation

- `ImageUploadReservation.id` — стабильный `reservationId`, созданный внутри DBOS workflow.
- Резервация хранит владельца и полный отсортированный набор `uploadIds`.
- `reserve`, `attach` и `release` атомарно изменяют агрегат резервации и связанные записи `File`.
- Статусы агрегата `RESERVED`, `ATTACHED`, `RELEASED` обеспечивают распознавание точных повторов.
- После `release` резервация остаётся в `RELEASED`, а файлы возвращаются в `COMPLETED` и теряют
  ссылку `reservationId`.

## Фоновая очистка неиспользованных загрузок

Одна задача обрабатывает не более 100 записей за запуск:

- `PENDING` — спустя 15 минут после `uploadExpiresAt`;
- `REJECTED` — спустя 15 минут после отклонения, если немедленное удаление не завершилось;
- `COMPLETED` — спустя 24 часа после `uploadedAt`, если файл не зарезервирован;
- незавершённую попытку очистки можно повторно захватить спустя один час.

Перед обращением в S3 запись помечается через `deletedAt`. После успешного `DeleteObject` запись
физически удаляется из Files DB. `DeleteObject` идемпотентен, поэтому повтор безопасен.
