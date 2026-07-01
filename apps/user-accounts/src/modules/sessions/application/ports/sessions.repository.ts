import type { CreateSessionParams, RotateRefreshTokenParams } from '../types/sessions.types.js';

export abstract class SessionsRepository {
  abstract isSessionActive(jti: string, sessionId: string): Promise<boolean>;
  abstract getSessionOwner(sessionId: string): Promise<string | null>;
  abstract createSession(params: CreateSessionParams): Promise<void>;
  abstract rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean>;
}
