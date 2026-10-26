export class SubscriptionCancellationConflictError extends Error {
  constructor(
    public readonly subscriptionId: string,
    public readonly providerSubscriptionId: string,
    public readonly reason: string,
  ) {
    super(`Cannot record provider subscription cancellation for ${subscriptionId}: ${reason}`);
    this.name = new.target.name;
  }
}
