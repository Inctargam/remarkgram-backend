export type TransactionContext = unknown;

export abstract class UnitOfWork {
  abstract run<T>(handler: (ctx: TransactionContext) => Promise<T>): Promise<T>;
}
