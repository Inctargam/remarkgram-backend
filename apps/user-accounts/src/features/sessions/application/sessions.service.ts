import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SessionsRepository } from './ports/sessions.repository.js';
import type {
  CreateSessionParams,
  RotateRefreshTokenParams,
  SessionIdentity,
} from './types/sessions.types.js';

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
      throw new Error('No active session found');
    }
  }

  /** Проверяет, существует ли активная сессия с указанными userId, sessionId и jti. */
  checkSession(params: SessionIdentity): Promise<boolean> {
    return this.sessionsRepository.isSessionActive(params);
  }

  /**
   * Проверяет существование сессии и принадлежность пользователю. Понадобится, например, при удалении
   * конкретной сессии по sessionId, чтобы пользователь не мог удалить чужую сессию.
   */
  async assertSessionOwnership(userId: string, sessionId: string): Promise<void> {
    if (!isUUID(sessionId)) {
      throw new Error('Session not found');
    }

    const sessionOwner = await this.sessionsRepository.getSessionOwner(sessionId);
    if (sessionOwner === null) {
      throw new Error('Session not found');
    }

    if (sessionOwner !== userId) {
      throw new Error('Access denied');
    }
  }
}
