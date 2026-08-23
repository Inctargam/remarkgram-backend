import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

// Nest's @Headers() does not accept parameter pipes, while a custom parameter
// decorator lets the controller apply ParseUUIDPipe to this header.
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  context.switchToHttp().getRequest<Request>().get('idempotency-key'),
);
