# Image upload lifecycle

Документ описывает текущий процесс загрузки изображений, создания поста и фоновой очистки.

## Sequence diagram

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь
    participant Frontend
    participant Gateway as API Gateway
    participant Files as Files service
    participant FilesDB as Files DB
    participant S3 as Yandex Object Storage
    participant Posts as Posts service
    participant PostsDB as Posts DB

    User->>Frontend: Выбирает 1–10 изображений
    Frontend->>Frontend: Проверяет формат и размер
    Frontend->>Gateway: POST /api/v1/files/image-uploads<br/>метаданные изображений
    Gateway->>Files: InitiateImageUploads (gRPC)
    Files->>Files: Проверяет количество, размер,<br/>Content-Type и clientFileId
    loop Для каждого изображения
        Files->>S3: Формирует presigned POST
    end
    Files->>FilesDB: Создаёт File в статусе PENDING
    Files-->>Gateway: Upload sessions: id, url, fields
    Gateway-->>Frontend: 201 Created

    loop Для каждой upload session
        Frontend->>S3: multipart/form-data по presigned POST
        S3-->>Frontend: Результат загрузки
    end

    Frontend->>Gateway: POST /api/v1/files/image-uploads/complete<br/>uploadIds
    Gateway->>Files: CompleteImageUploads (gRPC)
    Files->>FilesDB: Читает записи пользователя
    par Для каждого изображения
        Files->>S3: HeadObject
        S3-->>Files: Content-Length и Content-Type<br/>либо объект не найден
    end
    alt Все объекты существуют и метаданные совпадают
        Files->>FilesDB: Атомарно PENDING → COMPLETED<br/>и записывает uploadedAt
        Files-->>Gateway: Успех
    else Есть отсутствие или несовпадение метаданных
        Files->>FilesDB: Атомарно PENDING → REJECTED
        Files-->>S3: Асинхронная best-effort попытка удаления
        Files-->>Gateway: Ошибка подтверждения
    end
    Gateway-->>Frontend: 204 No Content или ошибка

    User->>Frontend: Нажимает Publish
    Frontend->>Gateway: POST /api/v1/posts<br/>description, imageIds
    Gateway->>Posts: CreatePost (gRPC)
    Posts->>Files: ReserveImageUploads (gRPC)
    Files->>FilesDB: Атомарно COMPLETED → RESERVED
    Files-->>Posts: Резерв создан
    Posts->>PostsDB: Атомарно создаёт Post и PostImage
    alt Post создан
        Posts->>Files: AttachReservedImageUploads (gRPC)
        Files->>FilesDB: RESERVED → ATTACHED
        Posts-->>Gateway: postId
        Gateway-->>Frontend: 201 Created
    else Post не создан
        Posts->>Files: ReleaseReservedImageUploads (gRPC)
        Files->>FilesDB: RESERVED → COMPLETED
        Posts-->>Gateway: Ошибка создания
        Gateway-->>Frontend: Ошибка
    end
```

## State diagram

```mermaid
stateDiagram-v2
    [*] --> PENDING: Созданы File и presigned POST

    PENDING --> COMPLETED: Объект найден,<br/>метаданные совпали
    PENDING --> REJECTED: Объект отсутствует или<br/>метаданные не совпали
    PENDING --> [*]: Истёк uploadExpiresAt<br/>и выполнена очистка

    REJECTED --> [*]: Немедленная или<br/>фоновая очистка

    COMPLETED --> RESERVED: ReserveImageUploads
    COMPLETED --> [*]: Не использован в течение TTL

    RESERVED --> ATTACHED: Пост создан
    RESERVED --> COMPLETED: Создание поста завершилось ошибкой

    ATTACHED --> [*]: Удаление поста<br/>(ещё не реализовано)

    note right of RESERVED
        reservationExpiresAt сохраняется,
        но автоматическое восстановление
        зависших резервов ещё не реализовано.
    end note

    note right of ATTACHED
        Изображения опубликованных постов
        не участвуют в очистке по TTL.
    end note
```

## Фоновая очистка

Одна ежедневная задача обрабатывает не более 100 записей за запуск:

- `PENDING` — спустя 15 минут после `uploadExpiresAt`;
- `REJECTED` — спустя 15 минут после отклонения, если немедленное удаление не завершилось;
- `COMPLETED` — спустя 24 часа после `uploadedAt`, если изображение не зарезервировано;
- повторно захватывает незавершённую попытку очистки спустя один час.

Перед обращением в S3 запись помечается через `deletedAt`. После успешного `DeleteObject` она
физически удаляется из БД. `DeleteObject` идемпотентен, поэтому повтор безопасен.

## Текущие ограничения

- Заголовок `Idempotency-Key` описан в Swagger, но идемпотентность всего `POST /posts` ещё не реализована.
- Состояние операции резервирования пока не хранится в отдельной таблице.
- Если пост записан, а `AttachReservedImageUploads` не завершился, автоматического восстановления пока нет.
- Просроченные `RESERVED` нельзя освобождать без проверки состояния создания поста, поэтому cron их не меняет.
- Удаление `ATTACHED` должно быть частью сценария удаления поста и пока не реализовано.
