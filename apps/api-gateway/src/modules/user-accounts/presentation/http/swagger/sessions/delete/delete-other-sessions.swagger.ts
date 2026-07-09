import { applyDecorators } from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation } from '@nestjs/swagger';

export const ApiDeleteOtherSessions = () =>
  applyDecorators(
    ApiOperation({ summary: 'Revoke all sessions except the current one' }),
    ApiNoContentResponse({ description: 'All other sessions were revoked.' }),
  );
