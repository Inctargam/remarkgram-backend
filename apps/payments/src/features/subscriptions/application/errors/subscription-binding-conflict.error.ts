export class SubscriptionBindingConflictError extends Error {
  constructor(
    public readonly paymentId: string,
    public readonly providerSubscriptionId: string,
    public readonly reason: string,
  ) {
    super(`Cannot bind provider subscription for payment ${paymentId}: ${reason}`);
    this.name = new.target.name;
  }
}
