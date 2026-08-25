# Files Service при удалении поста — C4 Component

**Уровень:** C4 Level 3 — Component  
**Контейнер:** Files Service  
**Родительская диаграмма:** [C4 Container](../container/post-deletion.md)

```mermaid
flowchart LR
    Broker["RabbitMQ<br/><small>Внешний контейнер</small>"]
    FilesDB[("Files DB<br/><small>Внешний контейнер · PostgreSQL</small>")]
    Storage["S3-совместимое хранилище<br/><small>Внешняя система</small>"]

    subgraph Files["Files Service · NestJS"]
        direction LR
        Consumer["PostDeletedEventConsumer<br/><small>Компонент · Presentation</small><br/>Валидирует событие, сохраняет inbox,<br/>после commit отправляет ACK"]
        InboxWorker["PostDeletedInboxWorker<br/><small>Компонент · Application</small><br/>Soft-delete файлов и создание<br/>заданий без retention-задержки"]
        InboxScheduler["PostDeletedInboxScheduler<br/><small>Компонент · Infrastructure</small><br/>Резервный запуск inbox worker"]
        DeletionWorker["FileDeletionJobsWorker<br/><small>Компонент · Application</small><br/>Удаляет объект, завершает задание<br/>и hard-delete запись файла"]
        DeletionScheduler["FileDeletionJobsScheduler<br/><small>Компонент · Infrastructure</small><br/>Запуск каждые 6 часов"]
        InboxRepo["PrismaInboxEventsRepository<br/><small>Компонент · Infrastructure</small><br/>Inbox, lease и retry"]
        FilesRepo["PrismaFilesRepository<br/><small>Компонент · Infrastructure</small><br/>Soft и hard delete файлов"]
        JobsRepo["PrismaFileDeletionJobsRepository<br/><small>Компонент · Infrastructure</small><br/>Отложенные задания, lease и retry"]
        UoW["PrismaUnitOfWork<br/><small>Компонент · Infrastructure</small><br/>Транзакционные границы"]
        S3Adapter["S3ObjectStorage<br/><small>Компонент · Infrastructure</small><br/>Адаптер DeleteObject"]

        Consumer -->|"add inbox"| InboxRepo
        Consumer -.->|"Запускает после ACK"| InboxWorker
        InboxScheduler -.->|"Резервный запуск"| InboxWorker
        InboxWorker -->|"claim / mark processed / retry"| InboxRepo
        InboxWorker -->|"softDeleteFileIdsByUser"| FilesRepo
        InboxWorker -->|"addMany(availableAt = deletedAt)"| JobsRepo
        InboxWorker -->|"run(transaction)"| UoW
        DeletionScheduler -.->|"Запускает"| DeletionWorker
        DeletionWorker -->|"claim / done / retry"| JobsRepo
        DeletionWorker -->|"hardDeleteSoftDeletedById"| FilesRepo
        DeletionWorker -->|"deleteObject"| S3Adapter
        DeletionWorker -->|"run(transaction)"| UoW
    end

    Broker -->|"posts.post-deleted.v1 · AMQP"| Consumer
    Consumer -->|"ACK / NACK"| Broker
    InboxRepo -->|"Prisma"| FilesDB
    FilesRepo -->|"Prisma"| FilesDB
    JobsRepo -->|"Prisma"| FilesDB
    UoW -->|"Транзакция Prisma"| FilesDB
    S3Adapter -->|"DeleteObject · S3 API"| Storage

    classDef external fill:#eeeeee,stroke:#666666,color:#1f1f1f
    classDef presentation fill:#85bbf0,stroke:#0b4884,color:#102a43
    classDef application fill:#9bd3ae,stroke:#39734d,color:#173d24
    classDef infrastructure fill:#d8c5f2,stroke:#70509a,color:#2f2142
    class Broker,FilesDB,Storage external
    class Consumer presentation
    class InboxWorker,DeletionWorker application
    class InboxScheduler,DeletionScheduler,InboxRepo,FilesRepo,JobsRepo,UoW,S3Adapter infrastructure
```

## Две стадии удаления файлов

1. Inbox worker транзакционно помечает записи файлов удалёнными, создаёт отложенные задания и завершает
   inbox-событие.
2. Задание доступно сразу после soft delete. Планировщик запускается каждые 6 часов; deletion worker
   идемпотентно удаляет объект из S3, а затем завершает задание и физически удаляет запись файла в
   транзакции с проверкой lease. При ошибках фактическое удаление откладывается до успешной попытки.
