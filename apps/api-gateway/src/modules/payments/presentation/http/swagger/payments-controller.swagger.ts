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

export const ApiPaymentsController = () =>
  applyDecorators(
    ApiTags('Payments'),
    ApiBearerAuth('accessToken'),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiUnauthorizedResponse({ description: 'The access token is missing, invalid or expired.' }),
    ApiBadGatewayResponse({
      description: 'The payments service returned an unexpected error.',
      type: ApiErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'The payments service is unavailable.',
      type: ApiErrorResponseDto,
    }),
  );
