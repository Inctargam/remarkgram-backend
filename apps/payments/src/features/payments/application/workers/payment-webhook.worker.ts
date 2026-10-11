import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentsRepository } from '../ports/payments.repository.js';
import { ProcessProviderWebhookUseCase } from '../use-cases/process-provider-webhook.use-case.js';

@Injectable()
export class PaymentWebhookWorker {
  private readonly logger = new Logger(PaymentWebhookWorker.name);
  private running = false;
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly processProviderWebhook: ProcessProviderWebhookUseCase,
  ) {}

  @Interval(5_000)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const events = await this.payments.claimProviderEvents(20, 300_000);
      for (const event of events) {
        try {
          await this.processProviderWebhook.execute(event);
        } catch (error) {
          await this.payments.markProviderEventError(
            event.eventId,
            'PROCESSING_ERROR',
            error instanceof Error ? error.message : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error('Failed to claim payment webhook batch', error);
    } finally {
      this.running = false;
    }
  }
}
