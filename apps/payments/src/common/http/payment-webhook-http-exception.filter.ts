import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { InvalidProviderEventError } from '../../features/payments/application/errors/invalid-provider-event.error.js';
import { PaymentProviderUnavailableError } from '../../features/payments/application/errors/payment-provider.error.js';
import { PaymentWebhookEnqueueUnavailableError } from '../application/errors/payments.error.js';
import {
  mapPaymentWebhookErrorToHttpException,
  type PaymentWebhookHttpError,
} from './mappers/payment-webhook-http-error.mapper.js';

@Catch(InvalidProviderEventError, PaymentProviderUnavailableError, PaymentWebhookEnqueueUnavailableError)
export class PaymentWebhookHttpExceptionFilter implements ExceptionFilter<PaymentWebhookHttpError> {
  catch(error: PaymentWebhookHttpError, host: ArgumentsHost): void {
    const exception = mapPaymentWebhookErrorToHttpException(error);
    host.switchToHttp().getResponse<Response>().status(exception.getStatus()).json(exception.getResponse());
  }
}
