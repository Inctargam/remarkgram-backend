import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { PaymentStatusResponseDto } from '../../dto/payment-status-response.dto.js';

export const ApiGetPaymentStatus = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get payment status',
      description:
        'Returns the status of a payment owned by the authenticated user. Missing and non-owned payments both return 404.',
    }),
    ApiExtraModels(PaymentStatusResponseDto),
    ApiResponse({
      status: HttpStatus.OK,
      description: 'Current status of the owned payment.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(PaymentStatusResponseDto) },
          examples: {
            pending: {
              summary: 'Provider confirmation is still pending',
              value: {
                paymentId: '11111111-1111-4111-8111-111111111111',
                status: 'PENDING',
                paidAt: null,
              },
            },
            succeeded: {
              summary: 'Financial success was confirmed',
              value: {
                paymentId: '11111111-1111-4111-8111-111111111111',
                status: 'SUCCEEDED',
                paidAt: '2026-10-19T12:00:00.000Z',
              },
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'The payment ID is not a UUID.',
      type: ValidationErrorResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'The payment does not exist or belongs to another user.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(
            HttpStatus.NOT_FOUND,
            'PAYMENT_NOT_FOUND',
            'Payment not found',
          ),
        },
      },
    }),
  );
