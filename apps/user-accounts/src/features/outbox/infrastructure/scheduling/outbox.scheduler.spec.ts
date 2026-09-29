import { SCHEDULE_CRON_OPTIONS } from '@nestjs/schedule/dist/schedule.constants.js';
import { CronExpression } from '@nestjs/schedule';
import { OutboxScheduler } from './outbox.scheduler.js';

describe('OutboxScheduler', () => {
  const worker = { run: vi.fn() };
  const events = { deletePublishedBefore: vi.fn() };
  const scheduler = new OutboxScheduler(worker as never, events as never);
  beforeEach(() => {
    vi.clearAllMocks();
    worker.run.mockResolvedValue(undefined);
  });
  afterEach(() => vi.useRealTimers());

  it('runs on startup without blocking bootstrap', () => {
    worker.run.mockReturnValueOnce(new Promise(() => {}));
    expect(scheduler.onApplicationBootstrap()).toBeUndefined();
    expect(worker.run).toHaveBeenCalledOnce();
  });

  it('runs every six hours with waitForCompletion and removes only history older than thirty days', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    // Проверяем метаданные декоратора, метод здесь не вызывается.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(Reflect.getMetadata(SCHEDULE_CRON_OPTIONS, scheduler.run)).toMatchObject({
      cronTime: CronExpression.EVERY_6_HOURS,
      waitForCompletion: true,
    });
    await scheduler.run();
    expect(events.deletePublishedBefore).toHaveBeenCalledWith(new Date('2026-08-26T12:00:00Z'));
    expect(worker.run.mock.invocationCallOrder[0]).toBeLessThan(
      events.deletePublishedBefore.mock.invocationCallOrder[0],
    );
  });

  it('logs scan failures without an unhandled background rejection', async () => {
    worker.run.mockRejectedValueOnce(new Error('database offline'));
    await expect(scheduler.run()).resolves.toBeUndefined();
    expect(events.deletePublishedBefore).not.toHaveBeenCalled();
  });
});
