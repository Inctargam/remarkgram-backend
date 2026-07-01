import type { QueryBus } from '@nestjs/cqrs';
import { SessionsGrpcController } from './sessions-grpc.controller.js';

describe('SessionsGrpcController', () => {
  it('authenticates the refresh token and maps sessions to the gRPC contract', async () => {
    const queryBus = { execute: vi.fn() };
    queryBus.execute
      .mockResolvedValueOnce({
        sub: '1',
        sessionId: 'session-id',
        jti: 'jti',
        iat: 100,
        exp: 200,
      })
      .mockResolvedValueOnce([
        {
          ip: '127.0.0.1',
          deviceName: 'Browser',
          lastActiveAt: new Date('2026-07-01T12:00:00.000Z'),
          sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        },
      ]);
    const controller = new SessionsGrpcController(queryBus as unknown as QueryBus);

    await expect(controller.getDevices({ refreshToken: 'refresh-token' })).resolves.toEqual({
      devices: [
        {
          ip: '127.0.0.1',
          title: 'Browser',
          lastActiveDate: '2026-07-01T12:00:00.000Z',
          deviceId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        },
      ],
    });
  });
});
