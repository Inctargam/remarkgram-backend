import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { PublicProfileResponseDto } from '../../../dto/output/public-profile-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiGetPublicProfile = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Get a public user profile',
      description: 'Returns the public profile available by user identifier.',
    }),
    ApiParam({
      name: 'userId',
      description: 'User identifier.',
      type: Number,
      required: true,
      example: 42,
    }),
    ApiOkResponse({
      description: 'The public user profile.',
      type: PublicProfileResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'The userId path parameter is not a positive integer.',
      type: ValidationErrorResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'The requested user was not found.',
      type: ApiErrorResponseDto,
      example: createApiErrorResponseExample(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User not found'),
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description: 'The user-accounts service returned an unexpected response.',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'The user-accounts service is unavailable.',
      type: ApiErrorResponseDto,
    }),
  );
