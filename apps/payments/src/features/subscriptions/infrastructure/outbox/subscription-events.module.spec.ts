import { BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME } from '@app/message-broker';
import type { OutboxMessage } from '@nestjs/outbox';
import { Subject, of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { BusinessAccessRmqTransport } from './subscription-events.module.js';

describe('Business access RabbitMQ transport', () => {
  it('sends the shared event envelope in a persistent message and waits for confirmation', async () => {
    const confirmed = new Subject<void>();
    const client = { emit: vi.fn().mockReturnValue(confirmed) };
    const transport = new BusinessAccessRmqTransport(client);
    let finished = false;
    const pending = Promise.resolve(transport.publish(message(), { signal: new AbortController().signal }))
      .then(() => { finished = true; });

    expect(client.emit).toHaveBeenCalledExactlyOnceWith(BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME, {
      data: {
        eventId: 'event-id',
        eventType: BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
        aggregateType: 'user',
        aggregateId: '42',
        data: { userId: 42, hasBusinessAccess: true, version: '7' },
      },
      options: { persistent: true, messageId: 'event-id' },
    });
    expect(finished).toBe(false);
    confirmed.complete();
    await pending;
    expect(finished).toBe(true);
  });

  it('fails a broker attempt and keeps the same event ID when the relay retries it', async () => {
    const error = new Error('broker unavailable');
    const client = {
      emit: vi.fn().mockReturnValueOnce(throwError(() => error)).mockReturnValueOnce(of(undefined)),
    };
    const transport = new BusinessAccessRmqTransport(client);
    const event = message();
    const options = { signal: new AbortController().signal };

    await expect(transport.publish(event, options)).rejects.toBe(error);
    await expect(transport.publish(event, options)).resolves.toBeUndefined();
    expect(client.emit.mock.calls[0]).toEqual(client.emit.mock.calls[1]);
  });
});

function message(): OutboxMessage {
  return {
    id: 'event-id',
    topic: BUSINESS_ACCESS_CHANGED_V1_EVENT_NAME,
    key: 'business-access:42',
    payload: { userId: 42, hasBusinessAccess: true, version: '7' },
    headers: {},
    createdAt: 0,
    availableAt: 0,
    attempts: 0,
    lastError: null,
  };
}
