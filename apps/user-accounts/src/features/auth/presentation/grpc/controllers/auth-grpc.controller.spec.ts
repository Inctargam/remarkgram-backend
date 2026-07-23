import type { CommandBus } from '@nestjs/cqrs';
import { LoginCommand } from '../../../application/use-cases/login.use-case.js';
import { RefreshTokenCommand } from '../../../application/use-cases/refresh-token.use-case.js';
import { AuthenticateOAuthCommand } from '../../../application/use-cases/authenticate-oauth.use-case.js';
import { OAuthProvider } from '@app/user-accounts-grpc';
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
        email: 'user@example.com',
        password: 'password',
        ip: '127.0.0.1',
        deviceName: 'Browser',
        currentSession: undefined,
      }),
    ).resolves.toEqual({ accessToken: 'access-token', refreshToken: 'refresh-token' });

    const command = commandBus.execute.mock.calls[0][0] as LoginCommand;
    expect(command).toBeInstanceOf(LoginCommand);
    expect(command.params).toEqual({
      email: 'user@example.com',
      password: 'password',
      ip: '127.0.0.1',
      deviceName: 'Browser',
      currentSession: undefined,
    });
  });

  it('passes verified refresh-token claims to the CQRS command', async () => {
    commandBus.execute.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    await controller.refreshToken({
      refreshTokenClaims: {
        userId: '1',
        sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
        jti: 'current-jti',
      },
      ip: '127.0.0.1',
      deviceName: 'Browser',
    });

    const command = commandBus.execute.mock.calls[0][0] as RefreshTokenCommand;
    expect(command).toBeInstanceOf(RefreshTokenCommand);
    expect(command.params.refreshTokenClaims).toEqual({
      userId: '1',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'current-jti',
    });
  });

  it('maps OAuth profile fields and session context to the CQRS command', async () => {
    commandBus.execute.mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    await controller.authenticateOAuth({
      identity: {
        provider: OAuthProvider.OAUTH_PROVIDER_GITHUB,
        subject: ' github-42 ',
        username: 'octocat',
        avatarUrl: 'https://avatars.example.com/octocat.png',
        emails: [{ email: 'octocat@example.com', verified: true, primary: true }],
      },
      ip: '127.0.0.1',
      deviceName: 'Browser',
    });

    const command = commandBus.execute.mock.calls[0][0] as AuthenticateOAuthCommand;
    expect(command).toBeInstanceOf(AuthenticateOAuthCommand);
    expect(command.sessionContext).toEqual({
      ip: '127.0.0.1',
      deviceName: 'Browser',
    });
    expect(command.oauth).toEqual({
      provider: 'github',
      providerSubject: 'github-42',
      username: 'octocat',
      avatarUrl: 'https://avatars.example.com/octocat.png',
      emails: [{ email: 'octocat@example.com', verified: true, primary: true }],
    });
  });
});
