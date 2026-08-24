# Удаление поста и медиафайлов — Sequence Diagram

Диаграмма дополняет [C4 System Context](../c4/system-context/post-deletion.md) и показывает динамику
сценария: где заканчивается синхронный HTTP-запрос и как после него продолжается асинхронное удаление.

```mermaid
sequenceDiagram
    autonumber
    actor User as Пользователь
    participant Клиент as Клиент Remarkgram
    participant Gateway as API Gateway
    participant Posts as Posts Service
    participant PostsDB as Posts DB
    participant Broker as RabbitMQ
    participant Files as Files Service
    participant FilesDB as Files DB
    participant Storage as S3-хранилище

    User->>Клиент: Удалить мой пост
    Клиент->>Gateway: DELETE /posts/:postId
    Gateway->>Posts: DeletePost(userId, postId) по gRPC
    Posts->>PostsDB: Найти пост

    alt Пост существует и принадлежит пользователю
        rect rgb(235, 245, 255)
            Note over Posts,PostsDB: Одна транзакция
            Posts->>PostsDB: Soft delete поста
            Posts->>PostsDB: Сохранить событие posts.post-deleted.v1 в outbox
        end
        Posts-->>Gateway: Удаление принято
        Gateway-->>Клиент: 204 No Content
        Клиент-->>User: Пост больше не отображается
    else Пост отсутствует или уже удалён
        Note over Posts: Идемпотентный результат:<br/>требуемое состояние уже достигнуто
        Posts-->>Gateway: Удаление не требуется
        Gateway-->>Клиент: 204 No Content
        Клиент-->>User: Пост больше не отображается
    else Пост принадлежит другому пользователю
        Posts-->>Gateway: Доступ запрещён
        Gateway-->>Клиент: Ошибка доступа
        Клиент-->>User: Удаление отклонено
    end

    Note over Posts,Storage: Дальнейшая обработка выполняется асинхронно
    PostsDB-->>Posts: Воркер забирает событие из outbox
    Posts->>Broker: Опубликовать posts.post-deleted.v1
    Broker->>Files: Доставить событие
    Files->>FilesDB: Сохранить событие в inbox
    Files-->>Broker: ACK

    rect rgb(245, 240, 255)
        Note over Files,FilesDB: Одна транзакция
        Files->>FilesDB: Soft delete связанных файлов
        Files->>FilesDB: Создать задания удаления с задержкой 24 часа
        Files->>FilesDB: Отметить inbox-событие обработанным
    end

    Note over FilesDB,Storage: Через 24 часа
    FilesDB-->>Files: Воркер забирает доступные задания
    Files->>Storage: DeleteObject для каждого медиафайла
    Storage-->>Files: Объект удалён или уже отсутствует
    Files->>FilesDB: Завершить задание и удалить запись файла
```

## Как читать диаграмму

- Сплошные стрелки обозначают запрос или команду, пунктирные — ответ либо получение работы воркером.
- Ответ `204 No Content` не ожидает физического удаления медиафайлов.
- Outbox и inbox отделяют изменение данных от доставки события и позволяют безопасно повторять
  обработку при временных ошибках.
- Физическое удаление начинается после 24-часового периода хранения. Повторный `DeleteObject`
  считается безопасным.
