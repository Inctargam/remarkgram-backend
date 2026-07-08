import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';
import { AccessTokenResponseDto } from '../../../dto/output/access-token-response.dto.js';

export const ApiRefreshToken = () =>
  applyDecorators(
    ApiCookieAuth('refreshToken'),
    ApiOperation({
      summary: 'Rotate the refresh token',
      description: 'Returns a new access token and replaces the refresh token cookie.',
    }),
    ApiOkResponse({ description: 'The token pair was rotated.', type: AccessTokenResponseDto }),
    ApiResponse({
      status: 401,
      description: 'The refresh token or its session is invalid.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            noActiveSession: {
              summary: 'The refresh token is not linked to an active session',
              value: createApiErrorResponseExample(401, 'NO_ACTIVE_SESSION', 'No active session found'),
            },
          },
        },
      },
    }),
  );
