import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Извлекает обязательный ключ одной попытки создания поста из HTTP-заголовка. */
export const IdempotencyKey = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<Request>();
  const idempotencyKey = request.get(IDEMPOTENCY_KEY_HEADER);

  if (idempotencyKey === undefined || !isUUID(idempotencyKey, '4')) {
    throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} header must be a UUID v4`);
  }

  return idempotencyKey;
});
