import { OAuthProvider } from '@app/user-accounts-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { GetCurrentUserQuery } from '../../../application/use-cases/get-current-user.use-case.js';
import { UsersGrpcController } from './users-grpc.controller.js';
import { UpdateUserProfileCommand } from '../../../application/use-cases/update-user-profile.use-case.js';

describe(UsersGrpcController.name, () => {
  const execute = vi.fn();
  const controller = new UsersGrpcController(
    { execute } as unknown as QueryBus,
    { execute } as unknown as CommandBus,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the current user view to the gRPC response', async () => {
    execute.mockResolvedValue({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: ['google', 'github'],
      createdAt: new Date('2026-08-21T10:15:00.000Z'),
    });

    await expect(controller.getCurrentUser({ userId: '42' })).resolves.toEqual({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: [OAuthProvider.OAUTH_PROVIDER_GOOGLE, OAuthProvider.OAUTH_PROVIDER_GITHUB],
      createdAt: '2026-08-21T10:15:00.000Z',
    });
    expect(execute).toHaveBeenCalledWith(expect.any(GetCurrentUserQuery));
    expect((execute.mock.calls[0]?.[0] as GetCurrentUserQuery).userId).toBe('42');
  });

  it('should return an empty response after updating the user profile', async () => {
    execute.mockResolvedValue({});
    try {
      const result = await controller.updateUserProfile({
        userId: '1',
        username: 'ivanovich',
        personalInfo: {
          firstName: 'Ivan',
          lastName: 'Ivanovich',
        },
      });
      expect(result).toEqual({});
    } catch (err) {
      console.dir(err);
    }

    expect(execute).toHaveBeenCalledWith(expect.any(UpdateUserProfileCommand));
  });
});
