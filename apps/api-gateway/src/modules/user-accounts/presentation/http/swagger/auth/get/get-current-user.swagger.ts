import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { CurrentUserResponseDto } from '../../../dto/output/current-user-response.dto.js';

export const ApiGetCurrentUser = () =>
  applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiOperation({ summary: 'Get the current authenticated user' }),
    ApiOkResponse({ description: 'The current user profile.', type: CurrentUserResponseDto }),
    ApiResponse({
      status: 401,
      description: 'The access token is invalid or its user no longer exists.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: getSchemaPath(ApiErrorResponseDto) },
              {
                type: 'object',
                required: ['statusCode', 'message', 'error'],
                properties: {
                  statusCode: { type: 'integer', example: 401 },
                  message: { type: 'string', example: 'Invalid access token' },
                  error: { type: 'string', example: 'Unauthorized' },
                },
              },
            ],
          },
        },
      },
    }),
  );
