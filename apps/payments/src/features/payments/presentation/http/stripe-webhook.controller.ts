import type { RawBodyRequest } from '@nestjs/common';
import { BadRequestException, Controller, Headers, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { InvalidProviderEventError } from '../../application/errors/payment-use-case.errors.js';
import { ProcessStripeWebhookUseCase } from '../../application/use-cases/process-stripe-webhook.use-case.js';

@Controller('payments/webhooks')
export class StripeWebhookController {
  constructor(private readonly processWebhook: ProcessStripeWebhookUseCase) {}

  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async handle(@Req() request: RawBodyRequest<Request>, @Headers('stripe-signature') signature?: string) {
    if (!request.rawBody || !signature)
      throw new BadRequestException('Raw body and Stripe-Signature are required');
    try {
      return { result: await this.processWebhook.execute(request.rawBody, signature) };
    } catch (error) {
      if (error instanceof InvalidProviderEventError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
