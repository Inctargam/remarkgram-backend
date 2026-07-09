import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiParam, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiDeleteSession = () =>
  applyDecorators(
    ApiOperation({ summary: 'Revoke a selected session' }),
    ApiParam({ name: 'sessionId', format: 'uuid', description: 'Session identifier.' }),
    ApiNoContentResponse({
      description:
        'The selected session was revoked. If the current session was selected, the refresh cookie was cleared.',
    }),
    ApiResponse({
      status: 404,
      description: 'The session does not exist or does not belong to the current user.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            sessionNotFound: {
              summary: 'Session was not found',
              value: createApiErrorResponseExample(404, 'SESSION_NOT_FOUND', 'Session not found'),
            },
          },
        },
      },
    }),
  );
