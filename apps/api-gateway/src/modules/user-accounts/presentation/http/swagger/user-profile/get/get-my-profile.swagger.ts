import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { MyProfileResponseDto } from '../../../dto/output/my-profile-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiGetMyProfile = () =>
  applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiOperation({
      summary: 'Get the authenticated user profile',
      description: 'Returns the complete profile of the authenticated user.',
    }),
    ApiOkResponse({
      description: 'The authenticated user profile.',
      type: MyProfileResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'The access token is missing, invalid, or expired.',
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'The authenticated user was not found.',
      type: ApiErrorResponseDto,
      example: createApiErrorResponseExample(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found'),
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description: 'A downstream service returned an unexpected response.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'A required downstream service is unavailable.',
      type: ApiErrorResponseDto,
    }),
  );
