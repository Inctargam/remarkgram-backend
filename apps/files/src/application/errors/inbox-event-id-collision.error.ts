export class InboxEventIdCollisionError extends Error {
  constructor(eventId: string) {
    super(`Inbox event ${eventId} already exists with different type or payload`);
    this.name = InboxEventIdCollisionError.name;
  }
}
