export class SubscriptionPaymentConflictError extends Error {
  constructor(
    readonly paymentId: string,
    readonly reason: string,
  ) {
    super(`Payment ${paymentId} cannot be applied to a subscription: ${reason}`);
    this.name = new.target.name;
  }
}
