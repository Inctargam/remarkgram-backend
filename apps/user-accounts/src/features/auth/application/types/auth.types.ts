export type JwtRefreshPayload = {
  sub: string;
  aud: string;
  sessionId: string;
  jti: string;
  iat: number;
  exp: number;
};

export type JwtPair = {
  accessToken: string;
  refreshToken: string;
};

export type GenerateTokenPairParams = {
  userId: string;
  sessionId: string;
};

export type GeneratedTokenPair = JwtPair & {
  refreshTokenPayload: JwtRefreshPayload;
};

export type LoginParams = {
  email: string;
  password: string;
  ip: string;
  deviceName: string;
  currentSession?: SessionIdentity;
};

export type RefreshTokenParams = {
  refreshTokenClaims: SessionIdentity;
  ip: string;
  deviceName: string;
};
import type { SessionIdentity } from '../../../sessions/application/types/sessions.types.js';

export type SessionRequestContext = {
  ip: string;
  deviceName: string;
  currentSession?: SessionIdentity;
};
