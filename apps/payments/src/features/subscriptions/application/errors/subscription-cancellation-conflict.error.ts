export class SubscriptionCancellationConflictError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly providerSubscriptionId: string,
    public readonly reason: string,
  ) {
    super(`Cannot record provider subscription cancellation for payment ${paymentId}: ${reason}`);
    this.name = new.target.name;
  }
}
