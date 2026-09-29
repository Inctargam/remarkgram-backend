import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse, getSchemaPath } from '@nestjs/swagger';
import { MAX_AVATAR_SIZE_BYTES } from '@app/files-grpc';
import { ApiErrorResponseDto } from '../../../../../../common/http/api-error-response.dto.js';
import { ValidationErrorResponseDto } from '../../../../../../common/http/validation-error-response.dto.js';
import { createApiErrorResponseExample } from '../../../../../../swagger/examples/api-error-response.example.js';
import { InitiateAvatarUploadDto } from '../../dto/input/initiate-avatar-upload.dto.js';
import { ImageUploadSessionDto } from '../../dto/output/initiate-image-uploads-response.dto.js';

export const ApiInitiateAvatarUpload = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Create an avatar upload session',
      description:
        'Send metadata of one final JPEG or PNG file, from 1 byte to 10 MiB inclusive. ' +
        'The response is one presigned POST session. Copy every returned field into FormData, ' +
        'append the file last and POST directly to the returned Object Storage URL. ' +
        'Example: const form = new FormData(); Object.entries(session.fields).forEach(([key, value]) => ' +
        'form.append(key, value)); form.append("file", file); await fetch(session.url, { method: "POST", body: form }); ' +
        'After a successful upload, call POST /api/v1/files/image-uploads/complete with ' +
        '{ "uploadIds": [session.id] }. This only confirms the file; it does not set the profile avatar. ' +
        'Completed uploads that remain unattached are eligible for cleanup after 24 hours.',
    }),
    ApiBody({ type: InitiateAvatarUploadDto }),
    ApiCreatedResponse({
      description: 'One presigned POST session was created and saved as PENDING.',
      type: ImageUploadSessionDto,
    }),
    ApiResponse({
      status: 400,
      description: 'Invalid request structure, image size or content type.',
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
              summary: 'Invalid metadata structure',
              value: {
                statusCode: 400,
                message: ['clientFileId must be a UUID'],
                error: 'Bad Request',
              },
            },
            invalidImageSize: {
              summary: 'The avatar is empty or larger than 10 MiB',
              value: createApiErrorResponseExample(
                400,
                'INVALID_IMAGE_SIZE',
                `Image size must be between 1 and ${MAX_AVATAR_SIZE_BYTES} bytes`,
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
          },
        },
      },
    }),
  );
