import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation } from '@nestjs/swagger';
import { SessionResponseDto } from '../../../dto/output/session-response.dto.js';

export const ApiGetSessions = () =>
  applyDecorators(
    ApiOperation({ summary: 'Get the active sessions of the current user' }),
    ApiOkResponse({
      description: 'Active, unexpired and non-revoked refresh sessions.',
      type: [SessionResponseDto],
    }),
  );
