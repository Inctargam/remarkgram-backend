import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiConfirmRegistration = () =>
  applyDecorators(
    ApiOperation({ summary: 'Confirm registration using the code from the email link' }),
    ApiNoContentResponse({ description: 'The email was confirmed.' }),
    ApiResponse({
      status: 400,
      description: 'The request body or confirmation code is invalid.',
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
              summary: 'Request validation failed',
              value: {
                statusCode: 400,
                message: ['code should not be empty'],
                error: 'Bad Request',
              },
            },
            invalidConfirmationCode: {
              summary: 'Confirmation code is invalid, expired, replaced or already used',
              value: createApiErrorResponseExample(
                400,
                'INVALID_CONFIRMATION_CODE',
                'Confirmation code is invalid',
              ),
            },
          },
        },
      },
    }),
  );
