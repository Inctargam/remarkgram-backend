import { Injectable, Logger } from '@nestjs/common';
import { UnitOfWork } from '../../../../common/application/unit-of-work.js';
import { IntegrationEventPublisher } from '../ports/integration-event.publisher.js';
import { OutboxEventsRepository, type OutboxCursor } from '../ports/outbox-events.repository.js';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly events: OutboxEventsRepository,
    private readonly publisher: IntegrationEventPublisher,
  ) {}

  async publish(eventId: string): Promise<void> {
    try {
      await this.unitOfWork.run(
        async (ctx) => {
          const event = await this.events.lockPending(eventId, ctx);
          if (!event) return;

          try {
            await this.publisher.publish(event);
          } catch (error) {
            // Ошибка не исключает событие из следующих проходов: publishedAt остаётся null.
            await this.events.recordFailure(eventId, String(error), ctx);
            this.logger.error(`Outbox publication failed; eventId=${eventId}: ${String(error)}`);
            return;
          }
          await this.events.markPublished(eventId, ctx);
        },
        { timeout: 10_000 },
      );
    } catch (error) {
      // При сбое БД транзакция откатится. Не пытаемся записать ошибку ещё одним запросом.
      this.logger.error(`Outbox transaction failed; eventId=${eventId}: ${String(error)}`);
    }
  }

  async run(): Promise<void> {
    const before = new Date();
    let cursor: OutboxCursor | undefined;

    while (true) {
      const events = await this.events.findPending(before, cursor);
      if (events.length === 0) return;

      for (const event of events) {
        await this.publish(event.id);
      }
      // Продвигаемся и после ошибки, чтобы не повторять одну запись бесконечно в этом проходе.
      cursor = events[events.length - 1];
    }
  }
}
