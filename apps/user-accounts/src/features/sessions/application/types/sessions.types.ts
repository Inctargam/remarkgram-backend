export type SessionView = {
  ip: string;
  deviceName: string;
  lastActiveAt: Date;
  sessionId: string;
  isCurrent: boolean;
};

export type SessionIdentity = {
  userId: string;
  sessionId: string;
  jti: string;
};

export type SessionRevokedReason =
  | 'USER_LOGOUT'
  | 'LOGOUT_ALL'
  | 'PASSWORD_CHANGED'
  | 'USER_LOCKED'
  | 'ADMIN_ACTION'
  | 'TOKEN_REUSE_DETECTED';

export type CreateSessionParams = {
  userId: string;
  expectedPasswordHash: string;
  sessionId: string;
  deviceName: string;
  ip: string;
  jti: string;
  lastActiveAt: Date;
  expiresAt: Date;
};

export type RevokeSessionParams = {
  userId: string;
  sessionId: string;
  reason: SessionRevokedReason;
};

export type RevokeCurrentSessionParams = SessionIdentity & {
  reason: SessionRevokedReason;
};

export type RevokeOtherSessionsParams = {
  userId: string;
  currentSessionId: string;
  reason: SessionRevokedReason;
};

export type RevokeAllSessionsParams = {
  userId: string;
  reason: SessionRevokedReason;
};

export type RotateRefreshTokenParams = {
  userId: string;
  sessionId: string;
  currentJti: string;
  newJti: string;
  deviceName: string;
  ip: string;
  lastActiveAt: Date;
  expiresAt: Date;
};
