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
} from '@nestjs/common';
import type { Request } from 'express';
import { InvalidProviderEventError } from '../../../../common/application/errors/payments.error.js';
import { ProcessStripeWebhookUseCase } from '../../application/use-cases/process-stripe-webhook.use-case.js';

@Controller('payments/webhooks')
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
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      };
      if (error instanceof InvalidProviderEventError) {
        this.logger.warn(details);
        throw new BadRequestException(error.message);
      }
      this.logger.error(details);
      throw error;
    }
  }
}
