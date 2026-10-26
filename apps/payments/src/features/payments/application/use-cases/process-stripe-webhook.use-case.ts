import { Inject, Injectable, Logger } from '@nestjs/common';
import { PaymentsError } from '../../../../common/domain/errors/payments.error.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PROVIDER_EVENT_ADAPTERS, type ProviderEventAdapter } from '../ports/provider-event-adapter.js';
import { ReceivePaymentEventUseCase } from './receive-payment-event.use-case.js';

export type ProcessProviderWebhookResult = 'RECEIVED' | 'IGNORED';

@Injectable()
export class ProcessStripeWebhookUseCase {
  private readonly logger = new Logger(ProcessStripeWebhookUseCase.name);
  constructor(
    private readonly provider: PaymentProviderPort,
    @Inject(PROVIDER_EVENT_ADAPTERS)
    private readonly adapters: readonly ProviderEventAdapter[],
    private readonly receivePaymentEvent: ReceivePaymentEventUseCase,
  ) {}
  async execute(rawBody: Buffer, signature: string): Promise<ProcessProviderWebhookResult> {
    let providerEventId: string | undefined;
    let providerEventType: string | undefined;
    let paymentId: string | null | undefined;

    try {
      const webhook = this.provider.verifyWebhook(rawBody, signature);
      providerEventId = webhook.id;
      providerEventType = webhook.type;
      this.logger.log({
        event: 'stripe_webhook_verified',
        providerEventId,
        providerEventType,
        providerCreatedAt: webhook.createdAt.toISOString(),
      });

      const adapter = this.adapters.find((candidate) => candidate.supports(webhook));

      if (!adapter) {
        this.logger.log({
          event: 'stripe_webhook_ignored',
          providerEventId,
          providerEventType,
          reason: 'UNSUPPORTED_EVENT_TYPE',
        });
        return 'IGNORED';
      }

      const adapted = adapter.adapt(webhook);
      paymentId = adapted.paymentId;
      this.logger.debug('adapted ->', adapted);
      const result = await this.receivePaymentEvent.execute(adapted);
      this.logger.log({
        event: 'stripe_webhook_durably_enqueued',
        providerEventId,
        providerEventType,
        paymentId,
        result,
      });
      return result;
    } catch (error) {
      this.logger.error({
        event: 'stripe_webhook_processing_failed',
        providerEventId,
        providerEventType,
        paymentId,
        applicationErrorCode: error instanceof PaymentsError ? error.code : undefined,
        errorName: error instanceof Error ? error.name : typeof error,
      });
      throw error;
    }
  }
}
