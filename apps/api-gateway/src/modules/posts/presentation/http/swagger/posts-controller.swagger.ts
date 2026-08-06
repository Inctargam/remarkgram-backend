import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiBearerAuth,
  ApiExtraModels,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../common/http/validation-error-response.dto.js';

export const ApiPostsController = () =>
  applyDecorators(
    ApiTags('Posts'),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiBearerAuth('accessToken'),
    ApiUnauthorizedResponse({
      description: 'The access token is missing, invalid or expired.',
      schema: {
        type: 'object',
        required: ['statusCode', 'message', 'error'],
        properties: {
          statusCode: { type: 'integer', example: 401 },
          message: { type: 'string', example: 'Invalid access token' },
          error: { type: 'string', example: 'Unauthorized' },
        },
      },
    }),
    ApiBadGatewayResponse({
      description: 'The posts service or one of its dependencies returned an unexpected error.',
      type: ApiErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'The posts service or files service is unavailable.',
      type: ApiErrorResponseDto,
    }),
  );
