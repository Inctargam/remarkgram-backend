import { applyDecorators } from '@nestjs/common';
import {
  ApiBadGatewayResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';

export const ApiDeleteAllData = () =>
  applyDecorators(
    ApiOperation({ summary: 'Delete all data from the microservice databases' }),
    ApiNoContentResponse({ description: 'All microservice database data was deleted.' }),
    ApiNotFoundResponse({ description: 'The testing endpoint is disabled.' }),
    ApiForbiddenResponse({ description: 'The testing endpoint key is invalid.' }),
    ApiBadGatewayResponse({ description: 'An upstream service returned an unexpected error.' }),
    ApiServiceUnavailableResponse({ description: 'A microservice is unavailable.' }),
  );
