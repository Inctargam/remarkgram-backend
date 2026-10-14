# Project instructions

## Verification

- Do not run tests, builds, linters, formatters, or other verification commands after every edit.
- Finish the agreed batch of changes before suggesting verification.
- Run verification commands only when the user explicitly requests them.
- After making changes, report which verification commands are recommended but were not run.

## Architecture

- Use `apps/posts` as the reference service for new code and structural changes.
- Services follow Clean Architecture with CQRS at the application boundary. Keep the dependency direction inward:
  - `domain` depends on no application, presentation, infrastructure, framework, transport, or persistence code.
  - `application` may depend on `domain` and shared public contracts. It must not depend on concrete infrastructure or presentation implementations.
  - `presentation` depends on `application` and transport contracts. It converts transport input into commands/queries and application results back into transport output.
  - `infrastructure` depends on application ports and domain objects. It implements persistence, external-service, messaging, workflow, and scheduling adapters.
  - `config` contains typed runtime configuration only.
  - `app.module.ts` is the composition root: register controllers, handlers, ports, and their concrete adapters there.
- Do not bypass a layer. Controllers must not call Prisma, RabbitMQ, DBOS, or external clients directly. Use cases and handlers must depend on application ports rather than concrete adapters.
- Shared wire contracts belong under `libs/contracts`; service-specific business behavior belongs under `apps/<service>/src`.
- Keep generated code in an explicit `generated` directory. Do not hand-edit generated files.

### Layer responsibilities and folders

```text
apps/<service>/src/
  domain/
    entities/                 # business entities and value objects
    enums/                    # domain enums
  application/
    use-cases/<operation>/    # commands, queries, handlers, and operation-local policies
    ports/                    # abstract inbound/outbound boundaries
    errors/                   # application/business errors
    types/                    # internal application parameter/result shapes
    integration-events/<event-name-vN>/
    workers/                  # application orchestration for background work
  presentation/
    grpc/                     # gRPC controllers and transport error filters/mappers
    http/                     # HTTP controllers, DTOs, guards, and filters when applicable
  infrastructure/
    prisma/                   # Prisma service, repositories, persistence mappers
    grpc/                     # outbound gRPC adapters
    rmq/                      # RabbitMQ publishers/consumers and constants
    dbos/                     # durable workflows and DBOS data sources
    schedulers/               # scheduler adapters that invoke application behavior
  config/                     # typed configuration factories
  app.module.ts               # dependency composition
  main.ts                     # process bootstrap
```

- Add only folders required by the service. Do not create empty architectural folders.
- Group a use case in `application/use-cases/<operation>/` when it has a handler, policy, or tests of its own.
- Keep transport-specific DTOs and generated request/response types out of `domain` and application ports.
- Persistence models must not escape `infrastructure`; map them to domain entities or application read models.

## Naming conventions

### Folders and files

- Use `kebab-case` for all authored folder and file names.
- Name a service directory with the plural bounded-context name when that is the established domain term: `apps/posts`, `apps/payments`, `apps/user-accounts`.
- Use role suffixes in file names so ownership is visible without opening the file:
  - `*.entity.ts`, `*.enum.ts`
  - `*.use-case.ts`, `*.query-handler.ts`, `*.policy.ts`
  - `*.repository.ts`, `*.gateway.ts`, `*.publisher.ts`, `*.workflow.ts`, `*.datasource.ts`
  - `*.controller.ts`, `*.filter.ts`, `*.mapper.ts`
  - `*.service.ts`, `*.worker.ts`, `*.scheduler.ts`, `*.config.ts`, `*.constants.ts`
  - `*.event.ts` for public event contracts
  - `*.spec.ts` for colocated unit tests and `*.integration.spec.ts` for integration tests
- Match the file name to its primary exported class or abstraction: `PrismaPostsRepository` lives in `prisma-posts.repository.ts`; `CreatePostUseCase` lives in `create-post.use-case.ts`.
- Use `<technology>-<capability>.<role>.ts` for adapters, for example `grpc-files.gateway.ts`, `prisma-posts.repository.ts`, and `rmq-posts-events.publisher.ts`.
- Use `<capability>-<role>.<role>.ts` only when both qualifiers add meaning, for example `post-deleted-outbox-event.mapper.ts`.
- TypeScript symbols use `PascalCase` for classes, types, interfaces, and enums; `camelCase` for methods, variables, parameters, and object properties; `UPPER_SNAKE_CASE` for true constants and injection tokens.
- Boolean names should describe the true state (`hasMore`, `isPublished`, `canRetry`). Collection names should be plural.

### Contracts by layer

- A contract name must describe both the business operation and its boundary role. Avoid generic names such as `Data`, `Payload`, `Input`, `Output`, `Manager`, or `Service` unless a framework-generated contract requires them.

#### Domain contracts

- Entity classes use a singular noun: `Post`, `PostImage`.
- Entity construction/state shapes use `<Entity>Props`: `PostProps`.
- Domain enums use a singular concept name; enum members follow the existing convention of that enum and remain stable once persisted or published.
- Domain contracts must use business terminology and must not contain `Prisma`, `Grpc`, `Rmq`, HTTP, or framework types.

#### Application contracts

- Commands use `<Verb><Entity>Command`; command handlers use `<Verb><Entity>UseCase` when they execute a business action: `CreatePostCommand`, `CreatePostUseCase`.
- Queries use `<Verb><Entity>Query`; query handlers use `<Verb><Entity>QueryHandler`: `GetAuthorPostsQuery`, `GetAuthorPostsQueryHandler`.
- Use-case input shapes use `<Verb><Entity>Params`; results use `<Verb><Entity>Result`.
- Port-specific shapes include the operation and port role when needed: `CreatePostRepositoryParams`, `FindAuthorPostsPageResult`, `CreatePostWorkflowParams`.
- Outbound ports are abstract classes so they can also be Nest injection tokens. Name them by capability: `PostsRepository`, `PostsQueryRepository`, `FilesGateway`, `PostsEventsPublisher`, `CreatePostWorkflow`, `UnitOfWork`.
- Separate write repositories from read/query repositories when their models or access patterns differ.
- Application errors use a precise condition plus `Error`: `InvalidPostImageCountError`, `PostUpdateConflictError`.
- Application contracts must not expose Prisma-generated types or transport request/response types.

#### Presentation contracts

- Controllers use `<Context><Transport>Controller`: `PostsGrpcController`.
- Transport filters and mappers include the transport: `PostsRpcExceptionFilter`, `PostsRpcErrorMapper`.
- Reuse request/response types from the public transport contract package. Convert identifiers and transport primitives at the controller boundary before constructing a command or query.
- HTTP-only DTOs, when required, use `<Verb><Entity>RequestDto` and `<Verb><Entity>ResponseDto`; do not reuse persistence or domain entities as DTOs.

#### Infrastructure contracts

- Concrete adapter names start with their technology and implement an application port: `PrismaPostsRepository`, `GrpcFilesGateway`, `RmqPostsEventsPublisher`, `DbosCreatePostWorkflow`.
- Persistence mappers use `<Entity><Technology>Mapper`: `PostPrismaMapper`.
- Infrastructure errors should be translated into application/domain errors at the adapter boundary when callers are expected to act on them.
- Injection tokens use `UPPER_SNAKE_CASE` and include the capability or client purpose: `POSTS_EVENTS_RMQ_CLIENT`.

#### External gRPC contracts

- Store service contracts in `libs/contracts/<context>-grpc/src/proto/<context>.proto`; generated TypeScript belongs in `src/generated` and exports through `src/index.ts`.
- Proto packages use `remarkgram.<context>.vN` and must be explicitly versioned.
- Proto services use `<Context>Service`; RPC methods use `PascalCase` verb-noun names.
- Messages use `<RpcName>Request` and `<RpcName>Response`; shared message types use a singular business noun.
- Proto field names use `snake_case`; generated TypeScript fields use the generator's `camelCase` output.
- Never renumber or reuse published proto field numbers. Add fields compatibly and use a new package/API version for breaking changes.
- Import public gRPC contracts through their `@app/<context>-grpc` package, not through another service's source tree.

#### External integration-event contracts

- Store shared event types in `libs/contracts/message-broker/src`.
- Version every published event in both its type and event name: `<Entity><PastTenseAction>V<N>Event` and a matching `<ENTITY>_<PAST_TENSE_ACTION>_V<N>_EVENT_NAME`, for example `PostDeletedV1Event` and `POST_DELETED_V1_EVENT_NAME`.
- Event files use `<entity>-<past-tense-action>-vN.event.ts`; application event construction lives in `application/integration-events/<entity>-<past-tense-action>-vN/`.
- Event factories use `<Entity><PastTenseAction>V<N>Factory`; factory params use `Create<Entity><PastTenseAction>V<N>Params`.
- Published event envelopes must include stable event identity/type and aggregate identity; event data must contain transport-safe primitives. Serialize `Date` values to ISO-8601 strings at the factory boundary.
- Treat published event names, versions, routing keys, and payload fields as compatibility contracts. Introduce a new version instead of silently making a breaking change.

## Import and change rules

- Use `.js` suffixes in relative TypeScript imports, matching the repository's NodeNext configuration.
- Prefer `import type` for type-only imports.
- Import shared libraries through configured `@app/*` aliases. Within a service, use relative imports and do not import from another `apps/<service>` directory.
- When adding a feature, define or update the public contract first, then application command/query and ports, then adapters and presentation wiring, and finally register dependencies in `app.module.ts`.
- Preserve existing public-contract compatibility unless the task explicitly authorizes a breaking change.

## Payments service rules

- Before changing `apps/payments`, read `docs/payments/agent-context.md` together with the affected
  domain/application contracts and the specifications for the current event slice.
- Implement provider events as separate vertical slices. Do not begin the next event until the current
  slice has been reviewed as `ACCEPT_AND_CONTINUE`, or its required refactor has been completed.
- Keep Payment and Subscription responsibilities separate:
  - Payments proves whether money was paid and owns provider reconciliation and financial history.
  - Subscriptions decides which access period the user receives.
- Treat these concepts as independent:
  - `PaymentType` describes the financial operation (`PURCHASE` or `RENEWAL`).
  - `CheckoutPurpose` describes local purchase intent and concurrency policy.
  - Stripe Checkout `mode` describes a provider contract.
- Never infer Stripe Checkout `mode` from `CheckoutPurpose`, reject a webhook because of such an
  inferred mismatch, or use `CheckoutPurpose` as a substitute for subscription lifecycle state.
- If provider mode becomes a reconciliation invariant, persist it independently when Checkout is
  created and compare webhook data with that persisted provider contract.
- `checkout.session.completed` enriches provider references and never proves financial success.
- `payment_intent.succeeded` confirms a one-time subscription extension.
- `invoice.paid` confirms an initial purchase or creates an idempotent renewal, depending on the
  provider billing reason.
- A failed payment attempt and a provider timeout are not terminal Payment failures. Preserve the
  possibility of a later success.
- Only a proven terminal provider outcome may set `FAILED` or `CANCELED`; never downgrade
  `SUCCEEDED`. A successful Payment must always have non-null `paidAt`.
- Refunds and subscription cancellation are separate lifecycles and must not be represented as
  `PaymentStatus.CANCELED`.
- Keep classification and reconciliation in application use cases. Persistence adapters receive
  prepared commands and perform only conditional atomic persistence operations.
- Store only allowlisted provider failure/cancellation audit data. Never persist card or payment-method
  details in Payment or webhook audit records.
