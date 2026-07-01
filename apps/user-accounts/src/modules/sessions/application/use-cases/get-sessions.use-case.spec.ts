import { GetSessionsQuery, GetSessionsUseCase } from './get-sessions.use-case.js';

describe('GetSessionsUseCase', () => {
  it('returns active user sessions', async () => {
    const sessions = [
      {
        ip: '127.0.0.1',
        deviceName: 'Browser',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      },
    ];
    const repository = { getActiveSessions: vi.fn().mockResolvedValue(sessions) };
    const useCase = new GetSessionsUseCase(repository);

    await expect(useCase.execute(new GetSessionsQuery('1'))).resolves.toEqual(sessions);
    expect(repository.getActiveSessions).toHaveBeenCalledWith('1');
  });
});
