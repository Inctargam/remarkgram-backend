export type TransactionContext = unknown;

export abstract class UnitOfWork {
  /** Выполняет набор операций в одной транзакции и передаёт общий контекст всем участникам. */
  abstract run<T>(handler: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
