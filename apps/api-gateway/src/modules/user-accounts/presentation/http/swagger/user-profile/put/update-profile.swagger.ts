import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const ApiUpdateProfile = () =>
  applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiOperation({
      summary: 'Update the current user profile',
      description:
        'Updates the username and personal information of the authenticated user. The first name and last name are required; the date of birth and biography are optional.',
    }),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiResponse({
      status: HttpStatus.NO_CONTENT,
      description: 'The profile was updated successfully. The response has no body.',
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description:
        'The request body failed HTTP validation, or the user-accounts service rejected the username, personal information, or date of birth.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: getSchemaPath(ValidationErrorResponseDto) },
              { $ref: getSchemaPath(ApiErrorResponseDto) },
            ],
          },
          examples: {
            validationError: {
              summary: 'The request body is invalid',
              value: {
                statusCode: HttpStatus.BAD_REQUEST,
                message: ['username must be longer than or equal to 6 characters'],
                error: 'Bad Request',
              },
            },
            invalidUsername: {
              summary: 'The username does not satisfy the domain rules',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_USERNAME_PATTERN',
                'Username contains invalid characters',
              ),
            },
            invalidFirstName: {
              summary: 'The first name does not satisfy the domain rules',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_PERSONAL_INFO_FIRST_NAME',
                'First name is invalid',
              ),
            },
            invalidLastName: {
              summary: 'The last name does not satisfy the domain rules',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_PERSONAL_INFO_LAST_NAME',
                'Last name is invalid',
              ),
            },
            invalidAboutMe: {
              summary: 'The biography exceeds the allowed length',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_PERSONAL_INFO_ABOUT_ME',
                'About me is invalid',
              ),
            },
            invalidBirthDate: {
              summary: 'The date of birth has an invalid format or is not a calendar date',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_BIRTH_DATE_FORMAT',
                'Invalid date format; expected dd.mm.yyyy',
              ),
            },
            minimumAgeNotMet: {
              summary: 'The user does not meet the minimum age requirement',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'BIRTH_DATE_MIN_ALLOWED_AGE',
                'The minimum allowed age requirement is not met',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.UNAUTHORIZED,
      description: 'The access token is missing, invalid, or expired.',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['statusCode', 'message', 'error'],
            properties: {
              statusCode: { type: 'integer', example: HttpStatus.UNAUTHORIZED },
              message: { type: 'string', example: 'Invalid access token' },
              error: { type: 'string', example: 'Unauthorized' },
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.NOT_FOUND,
      description: 'The authenticated user no longer exists.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(HttpStatus.NOT_FOUND, 'USER_NOT_FOUND', 'User Not Found'),
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'The requested username is already used by another user.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(
            HttpStatus.CONFLICT,
            'USERNAME_ALREADY_EXISTS',
            'Username already exists',
          ),
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description: 'The user-accounts service returned an unexpected error.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(HttpStatus.BAD_GATEWAY, 'INTERNAL', 'Internal server error'),
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'The user-accounts service is temporarily unavailable or cannot be reached.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(
            HttpStatus.SERVICE_UNAVAILABLE,
            'UNAVAILABLE',
            'The user-accounts service is unavailable',
          ),
        },
      },
    }),
  );
