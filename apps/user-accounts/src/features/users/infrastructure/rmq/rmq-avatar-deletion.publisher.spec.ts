import type { ClientProxy } from '@nestjs/microservices';
import { NEVER, Subject, of, throwError } from 'rxjs';
import { createAvatarDeletionEvent } from '../../application/integration-events/avatar-deletion-requested.event.js';
import { RmqAvatarDeletionPublisher } from './rmq-avatar-deletion.publisher.js';

const event = createAvatarDeletionEvent(42, '11111111-1111-4111-8111-111111111111');
describe('RmqAvatarDeletionPublisher', () => {
  const client = { emit: vi.fn() };
  const publisher = new RmqAvatarDeletionPublisher(client as unknown as ClientProxy);
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it('bounds broker confirmation waiting to five seconds', async () => {
    vi.useFakeTimers();
    client.emit.mockReturnValue(NEVER);
    const result = expect(publisher.publish(event)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(client.emit).toHaveBeenCalledExactlyOnceWith(event.eventType, event);
  });

  it('resolves on broker confirmation and propagates publication errors', async () => {
    client.emit.mockReturnValueOnce(of(undefined));
    await expect(publisher.publish(event)).resolves.toBeUndefined();
    client.emit.mockReturnValueOnce(throwError(() => new Error('broker unavailable')));
    await expect(publisher.publish(event)).rejects.toThrow('broker unavailable');
  });

  it('stops observing a late confirmation after timing out', async () => {
    vi.useFakeTimers();
    const confirmation = new Subject<void>();
    client.emit.mockReturnValue(confirmation);
    const result = expect(publisher.publish(event)).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(5_000);
    await result;
    expect(confirmation.observed).toBe(false);
    confirmation.next();
    confirmation.complete();
  });
});
