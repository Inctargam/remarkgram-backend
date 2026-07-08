import { applyDecorators } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';
import { AccessTokenResponseDto } from '../../../dto/output/access-token-response.dto.js';

export const ApiLogin = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Log in',
      description: 'Returns an access token and stores the refresh token in an httpOnly cookie.',
    }),
    ApiOkResponse({ description: 'Authentication succeeded.', type: AccessTokenResponseDto }),
    ApiBadRequestResponse({ description: 'The request body is invalid.', type: ValidationErrorResponseDto }),
    ApiResponse({
      status: 401,
      description: 'The email or password is incorrect.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            incorrectCredentials: {
              summary: 'Credentials are incorrect',
              value: createApiErrorResponseExample(401, 'INCORRECT_CREDENTIALS', 'Incorrect email/password'),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description: 'The email is not confirmed or the session is already active.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            emailNotConfirmed: {
              summary: 'Email is not confirmed',
              value: createApiErrorResponseExample(
                409,
                'EMAIL_NOT_CONFIRMED',
                'Email has not been confirmed',
              ),
            },
            userAlreadyLoggedIn: {
              summary: 'The supplied refresh cookie belongs to an active session',
              value: createApiErrorResponseExample(
                409,
                'USER_ALREADY_LOGGED_IN',
                'The user is already logged in',
              ),
            },
          },
        },
      },
    }),
  );
