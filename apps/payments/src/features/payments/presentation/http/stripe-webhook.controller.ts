import type { RawBodyRequest } from '@nestjs/common';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentWebhookHttpExceptionFilter } from '../../../../common/http/payment-webhook-http-exception.filter.js';
import { ProcessStripeWebhookUseCase } from '../../application/use-cases/process-stripe-webhook.use-case.js';

@Controller('payments/webhooks')
@UseFilters(PaymentWebhookHttpExceptionFilter)
export class StripeWebhookController {
  private readonly logger = new Logger(StripeWebhookController.name);

  constructor(private readonly processWebhook: ProcessStripeWebhookUseCase) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    const startedAt = Date.now();
    if (!request.rawBody || !signature) {
      this.logger.warn({
        event: 'stripe_webhook_rejected',
        reason: 'MISSING_RAW_BODY_OR_SIGNATURE',
        rawBodyPresent: Boolean(request.rawBody),
        signaturePresent: Boolean(signature),
      });
      throw new BadRequestException('Raw body and Stripe-Signature are required');
    }

    this.logger.log({
      event: 'stripe_webhook_received',
      rawBodyBytes: request.rawBody.byteLength,
    });

    try {
      const result = await this.processWebhook.execute(request.rawBody, signature);
      this.logger.log({
        event: 'stripe_webhook_http_completed',
        result,
        durationMs: Date.now() - startedAt,
      });
      return { result };
    } catch (error) {
      const details = {
        event: 'stripe_webhook_http_failed',
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : typeof error,
      };
      this.logger.error(details);
      throw error;
    }
  }
}
