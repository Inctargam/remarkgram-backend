import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiRegister = () =>
  applyDecorators(
    ApiOperation({ summary: 'Register a user and send an email confirmation link' }),
    ApiCreatedResponse({ description: 'The user was registered and the confirmation email was sent.' }),
    ApiBadRequestResponse({ description: 'The request body is invalid.', type: ValidationErrorResponseDto }),
    ApiResponse({
      status: 409,
      description: 'The username or email is already reserved.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            usernameAlreadyExists: {
              summary: 'Username is already reserved',
              value: createApiErrorResponseExample(409, 'USERNAME_ALREADY_EXISTS', 'Username already exists'),
            },
            emailAlreadyExists: {
              summary: 'Email is already reserved',
              value: createApiErrorResponseExample(409, 'EMAIL_ALREADY_EXISTS', 'Email already exists'),
            },
          },
        },
      },
    }),
  );
