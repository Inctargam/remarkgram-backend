import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../../../../common/http/decorators/idempotency-key.decorator.js';
import { SetAvatarDto } from '../../../dto/input/set-avatar.dto.js';

export const ApiSetAvatar = () =>
  applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiBody({ type: SetAvatarDto }),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description:
        'UUID v4 identifying this operation. Reuse it with the same fileId when repeating the request.',
    }),
    ApiOperation({
      summary: 'Set or replace the current user avatar',
      description:
        'First POST /files/avatar-upload, upload directly to S3, then POST /files/image-uploads/complete with {"uploadIds":["<id>"]}. Pass that id as fileId here. Accepts an owned, completed JPEG/PNG of 1 byte through 10 MiB inclusive. A successful response means the profile avatarFileId is updated and the image is available via GET /files/images/{fileId}. The previous avatar is scheduled for deletion. The request waits for the workflow result. Repeat requests must use the same Idempotency-Key and fileId. Read avatarFileId from GET /users/me/profile or GET /users/{userId}/profile.',
    }),
    ApiResponse({ status: 204, description: 'Avatar installed; response has no body.' }),
    ApiResponse({
      status: 400,
      description:
        'Invalid UUID or metadata. Image validation message: The photo must be less than 10 Mb and have JPEG or PNG format',
    }),
    ApiResponse({ status: 401, description: 'Access token is missing, invalid or expired.' }),
    ApiResponse({ status: 404, description: 'User or owned file not found.' }),
    ApiResponse({
      status: 409,
      description:
        'Another avatar update is in progress, the file is unavailable, or the key was used with a different fileId.',
    }),
    ApiResponse({
      status: 503,
      description:
        'Files request failed. The workflow retains its error and lock; retries in the gRPC adapter are not implemented yet.',
    }),
  );
