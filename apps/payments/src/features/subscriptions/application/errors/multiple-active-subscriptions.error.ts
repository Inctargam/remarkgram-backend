export class MultipleActiveSubscriptionsError extends Error {
  constructor(readonly userId: number) {
    super(`Multiple active subscriptions found for user ${userId}`);
    this.name = new.target.name;
  }
}
