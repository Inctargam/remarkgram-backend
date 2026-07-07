import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import {
  NoActiveSessionError,
  SessionAccessDeniedError,
  SessionNotFoundError,
} from './errors/sessions.errors.js';
import { SessionsRepository } from './ports/sessions.repository.js';
import type {
  CreateSessionParams,
  RevokeAllSessionsParams,
  RevokeCurrentSessionParams,
  RevokeOtherSessionsParams,
  RevokeSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
} from './types/sessions.types.js';
import type { TransactionContext } from '../../../common/application/unit-of-work.js';

@Injectable()
export class SessionsService {
  constructor(private readonly sessionsRepository: SessionsRepository) {}

  /** Сохраняет новую пользовательскую сессию после успешного входа. */
  createSession(params: CreateSessionParams): Promise<void> {
    return this.sessionsRepository.createSession(params);
  }

  /** Атомарно заменяет jti refresh-токена и отклоняет повторное использование старого токена. */
  async rotateRefreshToken(params: RotateRefreshTokenParams): Promise<void> {
    const wasRotated = await this.sessionsRepository.rotateRefreshToken(params);
    if (!wasRotated) {
      throw new NoActiveSessionError();
    }
  }

  /** Проверяет, существует ли активная сессия с указанными userId, sessionId и jti. */
  checkSession(params: SessionIdentity): Promise<boolean> {
    return this.sessionsRepository.isSessionActive(params);
  }

  /** Удаляет текущую сессию пользователя по данным проверенного refresh-токена. */
  revokeCurrentSession(params: RevokeCurrentSessionParams): Promise<boolean> {
    return this.sessionsRepository.revokeCurrentSession(params);
  }

  /** Отозвать указанную сессию пользователя через hard delete. */
  revokeUserSession(params: RevokeSessionParams): Promise<boolean> {
    return this.sessionsRepository.revokeUserSession(params);
  }

  /** Отозвать все сессии пользователя, кроме текущей refresh-сессии. */
  revokeOtherUserSessions(params: RevokeOtherSessionsParams): Promise<number> {
    return this.sessionsRepository.revokeOtherUserSessions(params);
  }

  /** Отозвать все сессии пользователя после security-sensitive события, например сброса пароля. */
  revokeAllUserSessions(params: RevokeAllSessionsParams, ctx?: TransactionContext): Promise<number> {
    return this.sessionsRepository.revokeAllUserSessions(params, ctx);
  }

  /**
   * Проверяет существование сессии и принадлежность пользователю. Понадобится, например, при удалении
   * конкретной сессии по sessionId, чтобы пользователь не мог удалить чужую сессию.
   */
  async assertSessionOwnership(userId: string, sessionId: string): Promise<void> {
    if (!isUUID(sessionId)) {
      throw new SessionNotFoundError();
    }

    const sessionOwner = await this.sessionsRepository.getSessionOwner(sessionId);
    if (sessionOwner === null) {
      throw new SessionNotFoundError();
    }

    if (sessionOwner !== userId) {
      throw new SessionAccessDeniedError();
    }
  }
}
