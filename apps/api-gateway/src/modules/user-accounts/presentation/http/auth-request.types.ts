import type { Request } from 'express';

export type RequestWithRefreshTokenCookie = Omit<Request, 'cookies'> & {
  cookies: {
    refreshToken?: string;
  };
};

export type RequestWithOptionalUserId = Request & {
  userId: string | null;
};
