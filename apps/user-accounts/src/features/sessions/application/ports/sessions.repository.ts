import type {
  CreateSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
} from '../types/sessions.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class SessionsRepository {
  abstract isSessionActive(params: SessionIdentity): Promise<boolean>;
  abstract getSessionOwner(sessionId: string): Promise<string | null>;
  abstract createSession(params: CreateSessionParams): Promise<boolean>;
  abstract rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean>;
  abstract deleteCurrentSession(params: SessionIdentity): Promise<boolean>;
  abstract deleteUserSession(userId: string, sessionId: string): Promise<boolean>;
  abstract deleteOtherUserSessions(userId: string, currentSessionId: string): Promise<number>;
  abstract deleteAllUserSessions(userId: string, ctx?: TransactionContext): Promise<number>;
}
