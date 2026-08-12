import { applyDecorators } from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiFoundResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';

export const ApiGetPublicFileUrl = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Redirect to a public image',
      description:
        'Resolves a completed, non-deleted file by its ID and redirects the client to its public Object Storage URL. ' +
        'The gateway does not proxy the image bytes. Browsers follow the redirect and download the image directly ' +
        'from Object Storage.',
    }),
    ApiFoundResponse({
      description: 'The client is redirected to the public Object Storage URL of the image.',
      headers: {
        Location: {
          description: 'Public URL of the image in Object Storage.',
          schema: {
            type: 'string',
            format: 'uri',
            example: 'https://pub-example.r2.dev/user/42/images/83d26252-a350-4e39-a78e-0bdf54d2341d',
          },
        },
      },
    }),
    ApiResponse({
      status: 400,
      description: 'The fileId path parameter is not a UUID v4.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ValidationErrorResponseDto) },
          example: {
            statusCode: 400,
            message: ['fileId must be a UUID'],
            error: 'Bad Request',
          },
        },
      },
    }),
    ApiNotFoundResponse({
      description: 'The file does not exist or is not available for public delivery.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(404, 'FILE_NOT_FOUND', 'File not found'),
        },
      },
    }),
    ApiForbiddenResponse({
      description: 'Object Storage cannot provide a public URL for the file.',
      content: {
        'application/json': {
          schema: { $ref: getSchemaPath(ApiErrorResponseDto) },
          example: createApiErrorResponseExample(403, 'FILE_PUBLIC_ACCESS_DENIED', 'File is not public'),
        },
      },
    }),
  );
