import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { IDEMPOTENCY_KEY_HEADER } from '../../../../../../../common/http/decorators/idempotency-key.decorator.js';

export const ApiDeleteAvatar = () =>
  applyDecorators(
    ApiBearerAuth('accessToken'),
    ApiHeader({
      name: IDEMPOTENCY_KEY_HEADER,
      required: true,
      schema: { type: 'string', format: 'uuid' },
      description:
        'UUID v4. Reuse the same key when repeating this deletion; a later avatar will not be removed.',
    }),
    ApiOperation({
      summary: 'Delete the current user avatar',
      description:
        'Call after confirming "Do you really want to delete your profile photo?". No request body. ' +
        '204 means avatarFileId is cleared and the deletion request is persisted in the durable deletion queue. ' +
        'RabbitMQ delivery and S3 deletion happen asynchronously. A missing avatar or profile also returns 204. ' +
        'Broker unavailability does not prevent success; pending messages are retried every 6 hours.',
    }),
    ApiResponse({ status: 204, description: 'Profile has no avatar; response has no body.' }),
    ApiResponse({ status: 400, description: 'Missing or invalid Idempotency-Key (UUID v4 required).' }),
    ApiResponse({ status: 401, description: 'Access token is missing, invalid or expired.' }),
    ApiResponse({ status: 404, description: 'Active user not found.' }),
    ApiResponse({ status: 409, description: 'Another avatar update is in progress.' }),
  );
