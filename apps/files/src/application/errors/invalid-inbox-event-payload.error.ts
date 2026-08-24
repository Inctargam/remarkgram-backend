export class InvalidInboxEventPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidInboxEventPayloadError.name;
  }
}
