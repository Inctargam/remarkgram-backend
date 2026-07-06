# TODO: Transaction Architecture Refactor

## Prompt

Нужно улучшить архитектуру работы с транзакциями в `password-reset` feature.

Сейчас репозитории могут принимать `Prisma.TransactionClient` напрямую как опциональный последний аргумент. Это рабочий и простой подход, но он протаскивает Prisma-тип в application layer через repository ports. Нужно перейти к более чистой архитектуре, где application layer не зависит от Prisma.

## Цель

Вынести управление транзакциями в отдельную абстракцию:

- `UnitOfWork` или `TransactionManager` в application layer.
- Prisma-specific реализация в infrastructure layer.
- Репозитории должны работать внутри общей транзакции без прямого импорта Prisma-типов в application ports.

## Рекомендуемый подход

Начать с явного `UnitOfWork`, потому что он проще для отладки и хорошо показывает, какие операции входят в транзакцию.

Пример application port:

```ts
export type TransactionContext = unknown;

export abstract class UnitOfWork {
  abstract run<T>(handler: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
```

Пример использования в use-case:

```ts
await this.unitOfWork.run(async (ctx) => {
  await this.usersRepository.updatePasswordHash(userId, passwordHash, ctx);
  await this.tokensRepository.markAsUsed(tokenId, now, ctx);
});
```

Пример Prisma implementation:

```ts
@Injectable()
export class PrismaUnitOfWork extends UnitOfWork {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(handler: (ctx: TransactionContext) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => handler(tx));
  }
}
```

В Prisma repositories оставить локальный cast внутри infrastructure:

```ts
private getClient(ctx?: TransactionContext): PrismaService | Prisma.TransactionClient {
  return (ctx as Prisma.TransactionClient | undefined) ?? this.prisma;
}
```

## Что сделать

- Создать application port для `UnitOfWork` или `TransactionManager`.
- Добавить Prisma implementation этого порта.
- Зарегистрировать реализацию в Nest module.
- Заменить прямой импорт `Prisma.TransactionClient` в application repository ports на `TransactionContext`.
- Обновить password reset use-cases, где несколько операций должны быть атомарными.
- Проверить, что обычные вызовы репозиториев без транзакции продолжают работать.

## Acceptance Criteria

- Application layer не импортирует `Prisma` или `Prisma.TransactionClient`.
- Транзакционный контекст можно передать в несколько репозиториев в рамках одного use-case.
- `ConfirmPasswordResetUseCase` может обновить пароль и пометить reset token использованным в одной транзакции.
- `RequestPasswordResetUseCase` может отозвать старые токены и создать новый токен в одной транзакции.
- Проходят `pnpm run build:user-accounts` и релевантный ESLint.

## Альтернатива на будущее

Если ручная передача `ctx` станет слишком шумной, рассмотреть `AsyncLocalStorage`-based `TransactionManager`.

В таком варианте use-case вызывает:

```ts
await this.transactionManager.run(async () => {
  await this.usersRepository.updatePasswordHash(userId, passwordHash);
  await this.tokensRepository.markAsUsed(tokenId, now);
});
```

А repositories получают текущий transaction client из storage:

```ts
private getClient(): PrismaService | Prisma.TransactionClient {
  return prismaTxStorage.getStore() ?? this.prisma;
}
```

Этот подход удобнее в больших сценариях, но добавляет скрытый контекст и усложняет отладку, поэтому его лучше рассматривать после явного `UnitOfWork`.
