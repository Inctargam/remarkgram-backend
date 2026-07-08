export type TransactionContext = unknown;

export type TransactionOptions = {
  maxWait?: number;
  timeout?: number;
};

export abstract class UnitOfWork {
  abstract run<T>(handler: (ctx: TransactionContext) => Promise<T>, options?: TransactionOptions): Promise<T>;
}
