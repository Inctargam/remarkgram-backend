# Posts Service при удалении поста — C4 Component

**Уровень:** C4 Level 3 — Component  
**Контейнер:** Posts Service  
**Родительская диаграмма:** [C4 Container](../container/post-deletion.md)

```mermaid
flowchart LR
    Gateway["API Gateway<br/><small>Внешний контейнер</small>"]
    PostsDB[("Posts DB<br/><small>Внешний контейнер · PostgreSQL</small>")]
    Broker["RabbitMQ<br/><small>Внешний контейнер</small>"]

    subgraph Posts["Posts Service · NestJS"]
        direction LR
        GrpcController["PostsGrpcController<br/><small>Компонент · Presentation</small><br/>Принимает DeletePost по gRPC"]
        Handler["SoftDeletePostUseCase<br/><small>Компонент · Application</small><br/>Валидирует IDs, проверяет владельца,<br/>обеспечивает идемпотентность"]
        EventFactory["PostDeletedV1Factory<br/><small>Компонент · Application</small><br/>Создаёт posts.post-deleted.v1"]
        PostRepo["PrismaPostsRepository<br/><small>Компонент · Infrastructure</small><br/>Читает и soft-delete пост"]
        OutboxRepo["PrismaOutboxEventsRepository<br/><small>Компонент · Infrastructure</small><br/>Сохраняет и арендует outbox-события"]
        UoW["PrismaUnitOfWork<br/><small>Компонент · Infrastructure</small><br/>Объединяет soft delete и outbox<br/>в одну транзакцию"]
        Worker["DeletedPostsPublisherWorker<br/><small>Компонент · Application</small><br/>Публикует доступные outbox-события,<br/>повторяет временные ошибки"]
        Scheduler["PublishDeletedPostEventScheduler<br/><small>Компонент · Infrastructure</small><br/>Резервный запуск каждые 6 часов"]
        CleanupScheduler["ClearSoftDeletedPostsScheduler<br/><small>Компонент · Infrastructure</small><br/>Hard delete каждые 12 часов,<br/>до 500 постов за запуск"]
        Publisher["RmqPostsEventsPublisher<br/><small>Компонент · Infrastructure</small><br/>AMQP adapter"]

        GrpcController -->|"DeletePostCommand"| Handler
        Handler -->|"findById / softDeleteById"| PostRepo
        Handler -->|"Создаёт событие"| EventFactory
        Handler -->|"run(transaction)"| UoW
        Handler -->|"add(event, transaction)"| OutboxRepo
        Handler -.->|"Запускает немедленно"| Worker
        Scheduler -.->|"Запускает для восстановления"| Worker
        CleanupScheduler -->|"clearSoftDeleted(500)"| PostRepo
        Worker -->|"findAvailableBatch /<br/>ensurePublished / retry"| OutboxRepo
        Worker -->|"publish"| Publisher
    end

    Gateway -->|"DeletePostRequest · gRPC"| GrpcController
    PostRepo -->|"Prisma"| PostsDB
    OutboxRepo -->|"Prisma"| PostsDB
    UoW -->|"Транзакция Prisma"| PostsDB
    Publisher -->|"posts.post-deleted.v1 · AMQP"| Broker

    classDef external fill:#eeeeee,stroke:#666666,color:#1f1f1f
    classDef presentation fill:#85bbf0,stroke:#0b4884,color:#102a43
    classDef application fill:#9bd3ae,stroke:#39734d,color:#173d24
    classDef infrastructure fill:#d8c5f2,stroke:#70509a,color:#2f2142
    class Gateway,PostsDB,Broker external
    class GrpcController presentation
    class Handler,EventFactory,Worker application
    class PostRepo,OutboxRepo,UoW,Scheduler,CleanupScheduler,Publisher infrastructure
```

## Ключевая гарантия

Soft delete поста и сохранение интеграционного события выполняются в одной транзакции. HTTP/gRPC-ответ
не зависит от успешной публикации в RabbitMQ: событие остаётся в outbox и будет обработано повторно.

Физическая очистка не имеет отдельного retention-периода: каждые 12 часов удаляется пакет до 500
soft-deleted постов. Из-за ограничения пакета и повторных попыток фактический срок может превышать
12 часов.
