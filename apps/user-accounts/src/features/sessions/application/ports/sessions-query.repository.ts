import type { SessionView } from '../types/sessions.types.js';

export abstract class SessionsQueryRepository {
  abstract getActiveSessions(userId: string, currentSessionId: string): Promise<SessionView[]>;
}
