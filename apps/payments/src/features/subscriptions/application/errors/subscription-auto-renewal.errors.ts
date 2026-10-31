// Prisma datasource retains name/message, so reason is also the serialized message.
export class InvalidSubscriptionAutoRenewalRequestError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = new.target.name;
  }
}

export class SubscriptionAutoRenewalConflictError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = new.target.name;
  }
}

export class SubscriptionAutoRenewalIdempotencyConflictError extends Error {
  constructor() {
    super('Idempotency-Key has already been used for another auto-renewal request');
    this.name = new.target.name;
  }
}

export class SubscriptionAutoRenewalFailedError extends Error {
  constructor(public readonly code: string) {
    super(`Auto-renewal operation did not complete: ${code}`);
    this.name = new.target.name;
  }
}
