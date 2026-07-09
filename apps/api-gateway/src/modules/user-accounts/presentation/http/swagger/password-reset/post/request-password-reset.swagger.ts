import { applyDecorators } from '@nestjs/common';
import { ApiAcceptedResponse, ApiBadRequestResponse, ApiOperation } from '@nestjs/swagger';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { PasswordResetResponse } from '../../../dto/output/password-reset.response.dto.js';

export const ApiRequestPasswordReset = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Request a password reset email',
      description:
        'Accepts the request without revealing whether the email exists. If a reset email was sent recently, the backend keeps a 1 minute cooldown and does not send another email during that window. The client should disable the resend button for 1 minute after submitting this request.',
    }),
    ApiAcceptedResponse({
      description:
        'The request was accepted. A reset email is sent only when the email belongs to a confirmed user and the 1 minute resend cooldown is not active.',
      type: PasswordResetResponse,
    }),
    ApiBadRequestResponse({ description: 'The email is invalid.', type: ValidationErrorResponseDto }),
  );
