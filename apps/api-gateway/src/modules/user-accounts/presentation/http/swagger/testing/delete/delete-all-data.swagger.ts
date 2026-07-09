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
    ApiOperation({ summary: 'Delete all data from the user-accounts database' }),
    ApiNoContentResponse({ description: 'All user-accounts data was deleted.' }),
    ApiNotFoundResponse({ description: 'The testing endpoint is disabled.' }),
    ApiForbiddenResponse({ description: 'The testing endpoint key is invalid.' }),
    ApiBadGatewayResponse({ description: 'The upstream service returned an unexpected error.' }),
    ApiServiceUnavailableResponse({ description: 'The user-accounts service is unavailable.' }),
  );
