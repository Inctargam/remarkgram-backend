import type { Request } from 'express';
import type { OAuthIdentityClaims, VerifiedRefreshTokenClaims } from '@app/user-accounts-grpc';

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

export type RequestWithOAuthIdentityClaims = Request & {
  user: OAuthIdentityClaims | null;
  // refreshTokenClaims?: VerifiedRefreshTokenClaims;
};

export type RequestWithUserId = Request & {
  userId: string;
};
