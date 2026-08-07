import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiExtraModels, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../../swagger/examples/api-error-response.example.js';

export const UpdatePostByIdSwagger = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Update a post',
      description: 'Updates the description of a post owned by the authenticated user.',
    }),
    ApiExtraModels(ApiErrorResponseDto, ValidationErrorResponseDto),
    ApiResponse({
      status: HttpStatus.NO_CONTENT,
      description: 'The post has been successfully updated.',
    }),
    ApiResponse({
      status: HttpStatus.BAD_REQUEST,
      description:
        'The path parameter or request body is invalid, or the posts service rejected an invalid post ID, user ID, or description.',
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
              summary: 'The path parameter or request body is invalid',
              value: {
                statusCode: HttpStatus.BAD_REQUEST,
                message: ['description must be shorter than or equal to 500 characters'],
                error: 'Bad Request',
              },
            },
            invalidUserId: {
              summary: 'The authenticated user ID is invalid',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_USER_ID',
                'User ID must be a positive 32-bit integer',
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
            invalidPostDescription: {
              summary: 'The post description is invalid',
              value: createApiErrorResponseExample(
                HttpStatus.BAD_REQUEST,
                'INVALID_POST_DESCRIPTION',
                'Post description must not exceed 500 characters',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.FORBIDDEN,
      description: 'The authenticated user is not allowed to update this post.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            postAccessForbidden: {
              summary: 'The post belongs to another user',
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
      status: HttpStatus.NOT_FOUND,
      description: 'The post was not found.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            postNotFound: {
              summary: 'The post does not exist',
              value: createApiErrorResponseExample(HttpStatus.NOT_FOUND, 'POST_NOT_FOUND', 'Post not found'),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: HttpStatus.CONFLICT,
      description: 'The post was modified concurrently and could not be updated.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            postUpdateConflict: {
              summary: 'The post changed after it was read',
              value: createApiErrorResponseExample(
                HttpStatus.CONFLICT,
                'POST_UPDATE_CONFLICT',
                'We were unable to save your changes. Please refresh the page and try again.',
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
