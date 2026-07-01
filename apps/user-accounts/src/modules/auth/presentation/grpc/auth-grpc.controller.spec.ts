import type { CommandBus } from '@nestjs/cqrs';
import { LoginCommand } from '../../application/use-cases/login.use-case.js';
import { RefreshTokenCommand } from '../../application/use-cases/refresh-token.use-case.js';
import { AuthGrpcController } from './auth-grpc.controller.js';

describe('AuthGrpcController', () => {
  const commandBus = { execute: vi.fn() };
  const controller = new AuthGrpcController(commandBus as unknown as CommandBus);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes transport-neutral login data to the CQRS command', async () => {
    commandBus.execute.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await expect(
      controller.login({
        loginOrEmail: 'user',
        password: 'password',
        ip: '127.0.0.1',
        deviceName: 'Browser',
        currentRefreshToken: undefined,
      }),
    ).resolves.toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });

    const command = commandBus.execute.mock.calls[0][0] as LoginCommand;
    expect(command).toBeInstanceOf(LoginCommand);
    expect(command.params).toEqual({
      loginOrEmail: 'user',
      password: 'password',
      ip: '127.0.0.1',
      deviceName: 'Browser',
      currentRefreshToken: undefined,
    });
  });

  it('passes the raw refresh token to the CQRS command', async () => {
    commandBus.execute.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    await controller.refreshToken({
      refreshToken: 'current-refresh-token',
      ip: '127.0.0.1',
      deviceName: 'Browser',
    });

    const command = commandBus.execute.mock.calls[0][0] as RefreshTokenCommand;
    expect(command).toBeInstanceOf(RefreshTokenCommand);
    expect(command.params.refreshToken).toBe('current-refresh-token');
  });
});
