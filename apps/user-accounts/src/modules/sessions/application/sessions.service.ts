import { Injectable } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { SessionsRepository } from './ports/sessions.repository.js';
import type { CreateSessionParams, RotateRefreshTokenParams } from './types/sessions.types.js';

@Injectable()
export class SessionsService {
  constructor(private readonly sessionsRepository: SessionsRepository) {}

  async createSession(params: CreateSessionParams): Promise<void> {
    await this.sessionsRepository.createSession(params);
  }

  async rotateRefreshToken(params: RotateRefreshTokenParams): Promise<void> {
    const wasRotated = await this.sessionsRepository.rotateRefreshToken(params);
    if (!wasRotated) {
      throw new Error('No active session found');
    }
  }

  async checkSession(jti: string, sessionId: string): Promise<boolean> {
    return this.sessionsRepository.isSessionActive(jti, sessionId);
  }

  // Для удаления сессий проверяем, что запрос отправляет владелец сессии. Пока не используется
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
