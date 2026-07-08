import type { CommandBus } from '@nestjs/cqrs';
import type { QueryBus } from '@nestjs/cqrs';
import { DeleteOtherSessionsCommand } from '../../../application/use-cases/delete-other-sessions.use-case.js';
import { DeleteSessionCommand } from '../../../application/use-cases/delete-session.use-case.js';
import { LogoutCurrentSessionCommand } from '../../../application/use-cases/logout-current-session.use-case.js';
import { SessionsGrpcController } from './sessions-grpc.controller.js';

describe('SessionsGrpcController', () => {
  it('authenticates the refresh token and maps sessions to the gRPC contract', async () => {
    const queryBus = { execute: vi.fn() };
    const commandBus = { execute: vi.fn() };
    queryBus.execute.mockResolvedValue([
      {
        ip: '127.0.0.1',
        deviceName: 'Browser',
        lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        isCurrent: true,
      },
    ]);
    const controller = new SessionsGrpcController(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
    );

    await expect(
      controller.getSessions({
        auth: {
          userId: '1',
          sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
          jti: 'jti',
        },
      }),
    ).resolves.toEqual({
      sessions: [
        {
          ip: '127.0.0.1',
          deviceName: 'Browser',
          lastActiveAt: '2026-07-01T12:00:00.000Z',
          sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
          isCurrent: true,
        },
      ],
    });
  });

  it('passes verified refresh-token claims to logout current session command', async () => {
    const queryBus = { execute: vi.fn() };
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const controller = new SessionsGrpcController(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
    );
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(controller.logoutCurrentSession({ auth })).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(new LogoutCurrentSessionCommand(auth));
  });

  it('passes verified refresh-token claims and session id to delete session command', async () => {
    const queryBus = { execute: vi.fn() };
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const controller = new SessionsGrpcController(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
    );
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(
      controller.revokeSession({
        auth,
        sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
      }),
    ).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(
      new DeleteSessionCommand({
        auth,
        sessionId: 'f318f7c0-c8cf-4fc2-93a5-a83234fb0f24',
      }),
    );
  });

  it('passes verified refresh-token claims to delete other sessions command', async () => {
    const queryBus = { execute: vi.fn() };
    const commandBus = { execute: vi.fn().mockResolvedValue(undefined) };
    const controller = new SessionsGrpcController(
      queryBus as unknown as QueryBus,
      commandBus as unknown as CommandBus,
    );
    const auth = {
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'jti',
    };

    await expect(controller.revokeOtherSessions({ auth })).resolves.toEqual({});
    expect(commandBus.execute).toHaveBeenCalledWith(new DeleteOtherSessionsCommand(auth));
  });
});
