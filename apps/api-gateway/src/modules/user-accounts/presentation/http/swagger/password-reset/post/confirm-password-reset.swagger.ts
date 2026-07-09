import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';
import { ConfirmPasswordResetDto } from '../../../dto/input/confirm-password-reset.dto.js';
import { ConfirmPasswordResetResponseDto } from '../../../dto/output/confirm-password-reset-response.dto.js';

export const ApiConfirmPasswordReset = () =>
  applyDecorators(
    ApiOperation({ summary: 'Set a new password using a password reset token' }),
    ApiBody({
      type: ConfirmPasswordResetDto,
      description:
        'Password reset confirmation payload. The token is taken from the password reset link sent by email.',
    }),
    ApiOkResponse({
      description: 'The password was changed and active sessions were revoked.',
      type: ConfirmPasswordResetResponseDto,
    }),
    ApiResponse({
      status: 400,
      description: 'The reset token or new password is invalid.',
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
              summary: 'The new password does not satisfy the password policy',
              value: {
                statusCode: 400,
                message: ['newPassword must be longer than or equal to 6 characters'],
                error: 'Bad Request',
              },
            },
            invalidPasswordResetToken: {
              summary: 'The reset link is invalid, expired, revoked or already used',
              value: createApiErrorResponseExample(
                400,
                'INVALID_PASSWORD_RESET_TOKEN',
                'Reset link is invalid or expired.',
              ),
            },
          },
        },
      },
    }),
  );
