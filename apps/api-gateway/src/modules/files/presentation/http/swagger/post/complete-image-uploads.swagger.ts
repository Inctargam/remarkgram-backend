import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiNoContentResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { CompleteImageUploadsDto } from '../../dto/input/complete-image-uploads.dto.js';

export const ApiCompleteImageUploads = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Confirm direct image uploads',
      description:
        'Call this endpoint after Object Storage has successfully accepted every selected multipart/form-data ' +
        'request. Files verifies ownership and performs HeadObject for each ID without downloading the object. ' +
        'The stored size and Content-Type must exactly match the metadata supplied when the session was created. ' +
        'The current implementation does not inspect magic bytes or decode the image contents. ' +
        'If one object is missing or mismatched, the whole submitted set becomes REJECTED. Repeating a request ' +
        'for an already COMPLETED set succeeds, making confirmation idempotent.',
    }),
    ApiBody({
      type: CompleteImageUploadsDto,
      description:
        'IDs of successfully uploaded sessions. A subset of the originally created sessions may be confirmed.',
    }),
    ApiNoContentResponse({ description: 'Every submitted upload is confirmed as COMPLETED.' }),
    ApiResponse({
      status: 400,
      description:
        'The request is malformed, contains duplicate IDs or contains fewer than 1 or more than 10 IDs.',
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
              summary: 'An upload ID is not a UUID v4',
              value: {
                statusCode: 400,
                message: ['each value in uploadIds must be a UUID'],
                error: 'Bad Request',
              },
            },
            invalidImageCount: {
              summary: 'The upload count is outside the 1–10 range',
              value: createApiErrorResponseExample(
                400,
                'INVALID_IMAGE_COUNT',
                'Image count must be between 1 and 10',
              ),
            },
            duplicateUploadId: {
              summary: 'The same upload ID occurs more than once',
              value: createApiErrorResponseExample(
                400,
                'DUPLICATE_IMAGE_UPLOAD_ID',
                'Image upload IDs must be unique',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 404,
      description: 'At least one upload does not exist, belongs to another user or is soft-deleted.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            uploadNotFound: {
              summary: 'One or more uploads are unavailable to the current user',
              value: createApiErrorResponseExample(
                404,
                'IMAGE_UPLOAD_NOT_FOUND',
                'One or more image uploads were not found',
              ),
            },
          },
        },
      },
    }),
    ApiResponse({
      status: 409,
      description: 'The upload statuses are incompatible or Object Storage metadata does not match.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          examples: {
            invalidUploadStatus: {
              summary: 'The set is neither entirely PENDING nor entirely COMPLETED',
              value: createApiErrorResponseExample(
                409,
                'INVALID_IMAGE_UPLOAD_STATUS',
                'Image uploads must be either all pending or all completed',
              ),
            },
            metadataMismatch: {
              summary: 'An object is missing or its size or Content-Type differs',
              value: createApiErrorResponseExample(
                409,
                'IMAGE_UPLOAD_METADATA_MISMATCH',
                'One or more uploaded images do not match the expected metadata',
              ),
            },
          },
        },
      },
    }),
  );
