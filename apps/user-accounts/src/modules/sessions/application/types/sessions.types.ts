export type SessionView = {
  ip: string;
  deviceName: string;
  lastActiveAt: Date;
  sessionId: string;
};

export type CreateSessionParams = {
  userId: string;
  sessionId: string;
  deviceName: string;
  ip: string;
  jti: string;
  lastActiveAt: Date;
  expiresAt: Date;
};

export type RotateRefreshTokenParams = {
  sessionId: string;
  currentJti: string;
  newJti: string;
  deviceName: string;
  ip: string;
  lastActiveAt: Date;
  expiresAt: Date;
};
