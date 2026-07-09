import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiCookieAuth,
  ApiExtraModels,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';

export const ApiSessionsController = () =>
  applyDecorators(
    ApiTags('Sessions'),
    ApiExtraModels(ApiErrorResponseDto),
    ApiCookieAuth('refreshToken'),
    ApiUnauthorizedResponse({ description: 'The refresh token or its session is invalid.' }),
    ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' }),
    ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' }),
  );
