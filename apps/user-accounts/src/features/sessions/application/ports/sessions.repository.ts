import type {
  CreateSessionParams,
  RevokeAllSessionsParams,
  RevokeCurrentSessionParams,
  RevokeOtherSessionsParams,
  RevokeSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
} from '../types/sessions.types.js';
import type { TransactionContext } from '../../../../common/application/unit-of-work.js';

export abstract class SessionsRepository {
  abstract isSessionActive(params: SessionIdentity): Promise<boolean>;
  abstract getSessionOwner(sessionId: string): Promise<string | null>;
  abstract createSession(params: CreateSessionParams): Promise<void>;
  abstract rotateRefreshToken(params: RotateRefreshTokenParams): Promise<boolean>;
  abstract revokeCurrentSession(params: RevokeCurrentSessionParams): Promise<boolean>;
  abstract revokeUserSession(params: RevokeSessionParams): Promise<boolean>;
  abstract revokeOtherUserSessions(params: RevokeOtherSessionsParams): Promise<number>;
  abstract revokeAllUserSessions(params: RevokeAllSessionsParams, ctx?: TransactionContext): Promise<number>;
}
