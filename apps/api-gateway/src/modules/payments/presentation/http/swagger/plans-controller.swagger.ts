import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiExtraModels,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../common/http/api-error-response.dto.js';

export const ApiPlansController = () =>
  applyDecorators(
    ApiTags('Plans'),
    ApiExtraModels(ApiErrorResponseDto),
    ApiBadGatewayResponse({
      description: 'The payments service returned an unexpected error.',
      type: ApiErrorResponseDto,
    }),
    ApiServiceUnavailableResponse({
      description: 'The payments service is unavailable.',
      type: ApiErrorResponseDto,
    }),
  );
