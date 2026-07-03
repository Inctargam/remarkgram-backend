import type {
  CreateSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
} from '../types/sessions.types.js';

export abstract class SessionsRepository {
  abstract isSessionActive(params: SessionIdentity): Promise<boolean>;
  abstract getSessionOwner(sessionId: string): Promise<string | null>;
  abstract createSession(params: CreateSessionParams): Promise<void>;
  abstract rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean>;
}
