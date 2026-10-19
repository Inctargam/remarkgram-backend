import { applyDecorators, HttpStatus } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../../../common/http/decorators/idempotency-key.decorator.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { CreateCheckoutDto } from '../../dto/create-checkout.dto.js';
import { CreateCheckoutResponseDto } from '../../dto/create-checkout-response.dto.js';

export const ApiCreateCheckout = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create or resume a payment checkout',
      description:
        'Creates a Stripe checkout for the authenticated user and selected plan. Repeating an identical request ' +
        'with the same Idempotency-Key returns the existing payment result. Reusing the key with different ' +
        'checkout parameters returns a conflict.',
    }),
    ApiBody({ type: CreateCheckoutDto }),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      description: 'Client-generated UUID v4 identifying one checkout attempt.',
      schema: {
        type: 'string',
        format: 'uuid',
        example: '7b96a443-8b33-41cf-9bd9-2f57b720d39e',
      },
    }),
    ApiCreatedResponse({
      description:
        'Checkout created or an idempotent existing result returned. checkoutUrl is null when no checkout redirect is required.',
      type: CreateCheckoutResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'The header, request body, plan/provider value, or payment invariant is invalid.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: getSchemaPath(ValidationErrorResponseDto) },
              { $ref: getSchemaPath(ApiErrorResponseDto) },
            ],
          },
          examples: {
            invalidIdempotencyKey: {
              summary: 'Missing or invalid Idempotency-Key',
              value: {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Idempotency-Key header must be a UUID v4',
                error: 'Bad Request',
              },
            },
            invalidBody: {
              summary: 'Invalid checkout body',
              value: {
                statusCode: HttpStatus.BAD_REQUEST,
                message: ['planId must not be less than 1'],
                error: 'Bad Request',
              },
            },
            invalidProvider: {
              summary: 'Unsupported payment provider',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_PAYMENT_PROVIDER',
                'Unsupported payment provider',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'The selected plan does not exist.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(
            HttpStatus.NOT_FOUND,
            'PLAN_NOT_FOUND',
            'Plan 42 was not found',
          ),
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description:
        'The idempotency key belongs to another request, an initial checkout is already active, or checkout reconciliation is required.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            idempotencyConflict: {
              value: createApiErrorResponseExample(
                HttpStatus.CONFLICT,
                'PAYMENT_IDEMPOTENCY_CONFLICT',
                'Idempotency-Key was already used with different checkout parameters',
              ),
            },
            initialCheckoutConflict: {
              value: createApiErrorResponseExample(
                HttpStatus.CONFLICT,
                'PAYMENT_INITIAL_RESERVATION_CONFLICT',
                'An initial subscription checkout is already in progress',
              ),
            },
            reconciliationRequired: {
              value: createApiErrorResponseExample(
                HttpStatus.CONFLICT,
                'PAYMENT_CHECKOUT_RECONCILIATION_REQUIRED',
                'Checkout correlation conflicts with an existing provider operation',
              ),
            },
          },
        },
      },
    }),
  );
