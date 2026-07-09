import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiResendRegistrationConfirmation = () =>
  applyDecorators(
    ApiOperation({ summary: 'Send a new registration confirmation link' }),
    ApiNoContentResponse({ description: 'A new confirmation email was sent when resending was applicable.' }),
    ApiResponse({
      status: 400,
      description: 'The email is malformed or does not belong to a user.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: getSchemaPath(ApiErrorResponseDto) },
              { $ref: getSchemaPath(ValidationErrorResponseDto) },
            ],
          },
          examples: {
            validationError: {
              summary: 'Email format is invalid',
              value: {
                statusCode: 400,
                message: ['email must be an email'],
                error: 'Bad Request',
              },
            },
            incorrectEmail: {
              summary: 'Email does not belong to a user',
              value: createApiErrorResponseExample(400, 'INCORRECT_EMAIL', 'Email is incorrect'),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description: 'The email is already confirmed.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            emailAlreadyConfirmed: {
              summary: 'Email is already confirmed',
              value: createApiErrorResponseExample(
                409,
                'EMAIL_ALREADY_CONFIRMED',
                'Email is already confirmed',
              ),
            },
          },
        },
      },
    }),
  );
