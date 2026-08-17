import { applyDecorators } from '@nestjs/common';
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { CreatePostDto } from '../../dto/input/create-post.dto.js';
import { CreatePostResponseDto } from '../../dto/output/create-post-response.dto.js';

export const ApiCreatePost = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create a post with completed image uploads',
      description:
        'Final step of publication creation. Supply the IDs previously confirmed through ' +
        'files/image-uploads/complete in their display order. Posts asks Files over gRPC to reserve images ' +
        'that exist, belong to the authenticated author, are not soft-deleted and have status COMPLETED. ' +
        'The post and its ordered image relations are then created atomically, after which the reservation ' +
        'is marked as attached.',
    }),
    ApiBody({
      type: CreatePostDto,
      description: 'Post description and completed image IDs in the desired display order.',
    }),
    ApiHeader({
      name: 'Idempotency-Key',
      required: false,
      description:
        'Client-generated UUID for one publication attempt. Reuse the same value only when retrying ' +
        'an identical request. The current API version accepts this header but does not yet enforce ' +
        'request-level idempotency.',
      schema: {
        type: 'string',
        format: 'uuid',
        example: '7b96a443-8b33-41cf-9bd9-2f57b720d39e',
      },
    }),
    ApiCreatedResponse({
      description: 'The post and all ordered image relations were created.',
      type: CreatePostResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'The request shape is invalid or a post invariant is violated: description length, image count or unique image IDs.',
      content: {
        'application/json': {
          schema: {
            oneOf: [
              { $ref: getSchemaPath(ApiErrorResponseDto) },
              { $ref: getSchemaPath(ValidationErrorResponseDto) },
            ],
          },
          examples: {
            validationError: {
              summary: 'An image ID is not a UUID v4',
              value: {
                statusCode: 400,
                message: ['each value in imageIds must be a UUID'],
                error: 'Bad Request',
              },
            },
            invalidDescription: {
              summary: 'The description is longer than 500 characters',
              value: createApiErrorResponseExample(
                400,
                'INVALID_POST_DESCRIPTION',
                'Post description must not exceed 500 characters',
              ),
            },
            invalidImageCount: {
              summary: 'The post image count is outside the 1–10 range',
              value: createApiErrorResponseExample(
                400,
                'INVALID_POST_IMAGE_COUNT',
                'Post image count must be between 1 and 10',
              ),
            },
            duplicateImageId: {
              summary: 'The same image ID occurs more than once',
              value: createApiErrorResponseExample(
                400,
                'DUPLICATE_POST_IMAGE_ID',
                'Post image IDs must be unique',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'At least one image does not exist, belongs to another user or is soft-deleted.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            imageNotFound: {
              summary: 'One or more images are unavailable to the author',
              value: createApiErrorResponseExample(
                404,
                'POST_IMAGE_NOT_FOUND',
                'One or more post images were not found',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description:
        'At least one image cannot be reserved in its current state or is already attached to another post.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            imagesNotAvailable: {
              summary: 'At least one image cannot be reserved for this post',
              value: createApiErrorResponseExample(
                409,
                'POST_IMAGES_NOT_AVAILABLE',
                'One or more post images are not available',
              ),
            },
            imageAlreadyAttached: {
              summary: 'At least one image is already used by another post',
              value: createApiErrorResponseExample(
                409,
                'POST_IMAGE_ALREADY_ATTACHED',
                'One or more images are already attached to a post',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 503,
      description: 'Posts could not verify images because Files is unavailable or exceeded its deadline.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            imageUploadsServiceUnavailable: {
              summary: 'The Files verification call failed',
              value: createApiErrorResponseExample(
                503,
                'IMAGE_UPLOADS_SERVICE_UNAVAILABLE',
                'The image uploads service is unavailable',
              ),
            },
          },
        },
      },
    }),
  );
