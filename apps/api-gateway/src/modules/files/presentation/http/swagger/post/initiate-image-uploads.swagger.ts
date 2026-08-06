import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { InitiateImageUploadsDto } from '../../dto/input/initiate-image-uploads.dto.js';
import { InitiateImageUploadsResponseDto } from '../../dto/output/initiate-image-uploads-response.dto.js';

export const ApiInitiateImageUploads = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create image upload sessions',
      description:
        'First step of publication creation. Send metadata of the final files after any client-side editing. ' +
        'The response contains one short-lived presigned POST session per image. Match each session to the ' +
        'local file by clientFileId, copy every returned field into FormData, append the file last and POST the ' +
        'form directly to the returned Object Storage URL. After the selected uploads succeed, call the ' +
        'image-uploads/complete endpoint with their session IDs.',
    }),
    ApiBody({
      type: InitiateImageUploadsDto,
      description: 'Metadata must describe the exact Blob or File that will be uploaded to Object Storage.',
    }),
    ApiCreatedResponse({
      description: 'Short-lived presigned POST sessions were created and saved as PENDING.',
      type: InitiateImageUploadsResponseDto,
    }),
    ApiResponse({
      status: 400,
      description:
        'The request shape is invalid or an upload invariant is violated: image count, size, content type or unique clientFileId.',
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
              summary: 'Request validation failed',
              value: {
                statusCode: 400,
                message: ['images.0.clientFileId must be a UUID'],
                error: 'Bad Request',
              },
            },
            invalidImageCount: {
              summary: 'The image count is outside the 1–10 range',
              value: createApiErrorResponseExample(
                400,
                'INVALID_IMAGE_COUNT',
                'Image count must be between 1 and 10',
              ),
            },
            invalidImageSize: {
              summary: 'An image is empty or larger than 20 MiB',
              value: createApiErrorResponseExample(
                400,
                'INVALID_IMAGE_SIZE',
                'Image size must be between 1 and 20971520 bytes',
              ),
            },
            unsupportedContentType: {
              summary: 'Only JPEG and PNG are supported',
              value: createApiErrorResponseExample(
                400,
                'UNSUPPORTED_IMAGE_CONTENT_TYPE',
                'Unsupported image content type: image/webp',
              ),
            },
            duplicateClientFileId: {
              summary: 'The same clientFileId occurs more than once',
              value: createApiErrorResponseExample(
                400,
                'DUPLICATE_CLIENT_FILE_ID',
                'Duplicate client file ID: 11111111-1111-4111-8111-111111111111',
              ),
            },
          },
        },
      },
    }),
  );
