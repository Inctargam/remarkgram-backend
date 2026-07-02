import type { Request } from 'express';
import type { VerifiedRefreshTokenClaims } from '@app/user-accounts-grpc';

type RequestWithRefreshTokenCookie = Omit<Request, 'cookies'> & {
  cookies: {
    refreshToken?: string;
  };
};

export type RequestWithOptionalRefreshSession = RequestWithRefreshTokenCookie & {
  refreshTokenClaims?: VerifiedRefreshTokenClaims;
};

export type RequestWithRefreshSession = RequestWithRefreshTokenCookie & {
  refreshTokenClaims: VerifiedRefreshTokenClaims;
};

export type RequestWithOptionalUserId = Request & {
  userId: string | null;
};
