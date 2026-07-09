import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiExtraModels,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';

export const ApiAuthController = () =>
  applyDecorators(
    ApiTags('Auth'),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' }),
    ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' }),
  );
