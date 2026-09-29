# API Gateway при удалении поста — C4 Component

**Уровень:** C4 Level 3 — Component  
**Контейнер:** API Gateway  
**Родительская диаграмма:** [C4 Container](../container/post-deletion.md)

```mermaid
flowchart LR
    Client["Клиент Remarkgram<br/><small>Внешняя система</small>"]
    Posts["Posts Service<br/><small>Внешний контейнер</small>"]

    subgraph Gateway["API Gateway · NestJS"]
        direction LR
        Guard["AccessTokenGuard<br/><small>Компонент</small><br/>Проверяет RS256, exp и aud=api;<br/>помещает sub в request.userId"]
        Controller["PostsHttpController<br/><small>Компонент</small><br/>Обрабатывает DELETE /posts/:postId<br/>и возвращает 204 No Content"]
        GrpcClient["Posts gRPC Client<br/><small>Компонент</small><br/>Адаптер контракта PostsServiceClient"]

        Guard -->|"Передаёт аутентифицированный<br/>HTTP-запрос с userId"| Controller
        Controller -->|"DeletePostRequest"| GrpcClient
    end

    Client -->|"DELETE /posts/:postId<br/>Bearer JWT · HTTPS"| Guard
    GrpcClient -->|"DeletePost(userId, postId)<br/>gRPC"| Posts
    Posts -->|"Успех или доменная ошибка"| GrpcClient
    Controller -->|"204 либо HTTP-ошибка"| Client

    classDef external fill:#eeeeee,stroke:#666666,color:#1f1f1f
    classDef component fill:#85bbf0,stroke:#0b4884,color:#102a43
    class Client,Posts external
    class Guard,Controller,GrpcClient component
```

## Граница ответственности

- API Gateway аутентифицирует запрос, преобразует HTTP-вход в gRPC-контракт и отображает результат
  обратно в HTTP.
- Проверка владельца и изменение данных выполняются не здесь, а в Posts Service.
- User Accounts во время запроса не вызывается: access-токен проверяется локально публичным ключом.

