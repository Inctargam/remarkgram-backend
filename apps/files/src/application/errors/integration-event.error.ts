export type IntegrationEventErrorCode =
  | 'INVALID_EVENT'
  | 'UNSUPPORTED_EVENT_TYPE'
  | 'INVALID_PAYLOAD'
  | 'UNSUPPORTED_EVENT_VERSION';
export abstract class IntegrationEventError extends Error {
  abstract readonly code: IntegrationEventErrorCode;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidEventError extends IntegrationEventError {
  readonly code = 'INVALID_EVENT';
  constructor() {
    super(`Invalid event`);
  }
}

export class UnsupportedEventTypeError extends IntegrationEventError {
  readonly code = 'UNSUPPORTED_EVENT_TYPE';
  constructor() {
    super(`Unsupported event type`);
  }
}

