import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { PaymentsRepository } from '../ports/payments.repository.js';
import { ApplySuccessfulPaymentUseCase } from '../use-cases/apply-successful-payment.use-case.js';

@Injectable()
export class PaymentSubscriptionLinkerWorker {
  private readonly logger = new Logger(PaymentSubscriptionLinkerWorker.name);
  private running = false;
  constructor(
    private readonly payments: PaymentsRepository,
    private readonly applyPayment: ApplySuccessfulPaymentUseCase,
  ) {}
  @Interval(5_000)
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const id of await this.payments.claimApplicationPayments(20, 300_000)) {
        await this.applyPayment.execute(id);
      }
    } catch (error) {
      this.logger.error('Failed to run payment subscription linker', error);
    } finally {
      this.running = false;
    }
  }
}
