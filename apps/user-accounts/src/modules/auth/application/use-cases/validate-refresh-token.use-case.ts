import { Query, QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RefreshTokenValidator } from '../refresh-token-validator.js';
import type { JwtRefreshPayload } from '../types/auth.types.js';

export class ValidateRefreshTokenQuery extends Query<JwtRefreshPayload> {
  constructor(public readonly refreshToken: string) {
    super();
  }
}

@QueryHandler(ValidateRefreshTokenQuery)
export class ValidateRefreshTokenUseCase implements IQueryHandler<ValidateRefreshTokenQuery> {
  constructor(private readonly refreshTokenValidator: RefreshTokenValidator) {}

  async execute(query: ValidateRefreshTokenQuery) {
    return this.refreshTokenValidator.validate(query.refreshToken);
  }
}
