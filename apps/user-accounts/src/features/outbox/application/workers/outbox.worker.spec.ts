import { OutboxWorker } from './outbox.worker.js';
import { createAvatarDeletionEvent } from '../../../users/application/integration-events/avatar-deletion-requested.event.js';

describe('OutboxWorker', () => {
  const ctx = {};
  const unitOfWork = { run: vi.fn(async (fn: (ctx: unknown) => Promise<void>) => fn(ctx)) };
  const events = {
    lockPending: vi.fn(),
    markPublished: vi.fn(),
    recordFailure: vi.fn(),
    findPending: vi.fn(),
  };
  const publisher = { publish: vi.fn() };
  const worker = new OutboxWorker(unitOfWork, events as never, publisher);
  const event = createAvatarDeletionEvent(42, '11111111-1111-4111-8111-111111111111');

  beforeEach(() => {
    vi.clearAllMocks();
    events.lockPending.mockResolvedValue(event);
    events.markPublished.mockResolvedValue(undefined);
    events.recordFailure.mockResolvedValue(undefined);
    publisher.publish.mockResolvedValue(undefined);
  });

  it('waits for confirmation before marking published in the locking transaction', async () => {
    let confirm!: () => void;
    publisher.publish.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        confirm = resolve;
      }),
    );
    const sending = worker.publish(event.eventId);
    await vi.waitFor(() => expect(publisher.publish).toHaveBeenCalledWith(event));
    expect(events.markPublished).not.toHaveBeenCalled();
    confirm();
    await sending;
    expect(events.lockPending).toHaveBeenCalledWith(event.eventId, ctx);
    expect(events.markPublished).toHaveBeenCalledWith(event.eventId, ctx);
    expect(unitOfWork.run).toHaveBeenCalledWith(expect.any(Function), { timeout: 10_000 });
  });

  it('skips a missing, locked or already published event', async () => {
    events.lockPending.mockResolvedValueOnce(null);
    await worker.publish(event.eventId);
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  it('records a publication failure without marking published', async () => {
    publisher.publish.mockRejectedValueOnce(new Error('offline'));
    await worker.publish(event.eventId);
    expect(events.recordFailure).toHaveBeenCalledWith(event.eventId, 'Error: offline', ctx);
    expect(events.markPublished).not.toHaveBeenCalled();
  });

  it('does not make another error write when the transaction or error write fails', async () => {
    publisher.publish.mockRejectedValueOnce(new Error('offline'));
    events.recordFailure.mockRejectedValueOnce(new Error('database down'));
    await expect(worker.publish(event.eventId)).resolves.toBeUndefined();
    expect(events.recordFailure).toHaveBeenCalledOnce();
    expect(unitOfWork.run).toHaveBeenCalledOnce();
  });

  it('does not treat a failed publication commit as a broker failure', async () => {
    events.markPublished.mockRejectedValueOnce(new Error('commit failed'));
    await expect(worker.publish(event.eventId)).resolves.toBeUndefined();
    expect(events.recordFailure).not.toHaveBeenCalled();
  });

  it('advances past failures, fixes the upper bound, and starts the next pass without a cursor', async () => {
    const first = { id: event.eventId, createdAt: new Date(1) };
    const second = { id: '22222222-2222-4222-8222-222222222222', createdAt: new Date(1) };
    events.findPending
      .mockResolvedValueOnce([first])
      .mockResolvedValueOnce([second])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    publisher.publish.mockRejectedValueOnce(new Error('offline'));
    await worker.run();
    await worker.run();
    const before = events.findPending.mock.calls[0][0] as Date;
    expect(events.findPending.mock.calls.slice(0, 3)).toEqual([
      [before, undefined],
      [before, first],
      [before, second],
    ]);
    expect(events.findPending.mock.calls[3][1]).toBeUndefined();
    expect(publisher.publish).toHaveBeenCalledTimes(2);
  });
});
