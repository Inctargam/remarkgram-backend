import { HttpException, HttpStatus } from '@nestjs/common';
import type { PaymentWebhookEnqueueUnavailableError } from '../../application/errors/payments.error.js';
import { InvalidProviderEventError } from '../../../features/payments/application/errors/invalid-provider-event.error.js';
import { PaymentProviderUnavailableError } from '../../../features/payments/application/errors/payment-provider.error.js';
import { PaymentsHttpErrorResponseDto } from '../payments-http-error-response.dto.js';

export type PaymentWebhookHttpError =
  | InvalidProviderEventError
  | PaymentProviderUnavailableError
  | PaymentWebhookEnqueueUnavailableError;

export const mapPaymentWebhookErrorToHttpException = (error: PaymentWebhookHttpError): HttpException => {
  const httpStatus =
    error instanceof InvalidProviderEventError ? HttpStatus.BAD_REQUEST : HttpStatus.SERVICE_UNAVAILABLE;

  return new HttpException(
    new PaymentsHttpErrorResponseDto(httpStatus, error.code, error.message),
    httpStatus,
  );
};
