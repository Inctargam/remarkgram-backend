import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';

export const ApiDeletePost = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Delete a post',
      description: 'Deletes a post owned by the authenticated author.',
    }),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiResponse({
      status: HttpStatus.NO_CONTENT,
      description: 'The post has been successfully deleted or was already absent.',
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description: 'The path parameter or authenticated user ID is invalid.',
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
              summary: 'The post ID path parameter is invalid',
              value: {
                statusCode: HttpStatus.BAD_REQUEST,
                message: 'Validation failed (numeric string is expected)',
                error: 'Bad Request',
              },
            },
            invalidUserId: {
              summary: 'The authenticated user ID is invalid',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_USER_ID',
                'User ID must be a positive integer',
              ),
            },
            invalidPostId: {
              summary: 'The post ID is invalid',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_POST_ID',
                'Invalid post id',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'The authenticated author is not allowed to delete a post owned by another user.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            postAccessForbidden: {
              summary: 'The post belongs to another author',
              value: createApiErrorResponseExample(
                HttpStatus.FORBIDDEN,
                'POST_ACCESS_FORBIDDEN',
                'Access to this post is forbidden',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.BAD_GATEWAY,
      description: 'The upstream service returned an unexpected error.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            internalUpstreamError: {
              summary: 'The posts service returned an internal error',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_GATEWAY,
                'INTERNAL',
                'Internal server error',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description: 'The posts service is unavailable.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            postsServiceUnavailable: {
              summary: 'The posts service cannot be reached',
              value: createApiErrorResponseExample(
                HttpStatus.SERVICE_UNAVAILABLE,
                'UNAVAILABLE',
                'The posts service is unavailable',
              ),
            },
          },
        },
      },
    }),
  );
