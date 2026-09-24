import { SetAvatarCommand } from '../../../application/use-cases/set-avatar.use-case.js';
import { status } from '@grpc/grpc-js';
import type { UpdateProfileInfoRequest } from '@app/user-accounts-grpc';
import { OAuthProvider } from '@app/user-accounts-grpc';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { RpcException } from '@nestjs/microservices';
import { GetCurrentUserQuery } from '../../../application/use-cases/get-current-user.use-case.js';
import { GetMyProfileQuery } from '../../../application/use-cases/get-my-profile.query-handler.js';
import { GetPublicProfileQuery } from '../../../application/use-cases/get-public-profile.query-handler.js';
import { UpdateProfileInfoCommand } from '../../../application/use-cases/update-profile-info.use-case.js';
import { UsersGrpcController } from './users-grpc.controller.js';

const validUpdateRequest: UpdateProfileInfoRequest = {
  userId: 1,
  username: 'ivanovich',
  personalInfo: {
    firstName: 'Ivan',
    lastName: 'Ivanovich',
    dateOfBirth: '1990-01-15',
    aboutMe: 'Backend developer',
    countryCode: 'UA',
    city: 'Kyiv',
  },
};

describe(UsersGrpcController.name, () => {
  const queryExecute = vi.fn();
  const commandExecute = vi.fn();
  const controller = new UsersGrpcController(
    { execute: queryExecute } as unknown as QueryBus,
    { execute: commandExecute } as unknown as CommandBus,
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delegates avatar installation to the command bus', async () => {
    commandExecute.mockResolvedValue(undefined);
    const request = {
      userId: 42,
      fileId: '11111111-1111-4111-8111-111111111111',
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
    };
    await expect(controller.setAvatar(request)).resolves.toEqual({});
    expect(commandExecute).toHaveBeenCalledWith(new SetAvatarCommand(request));
  });

  it('maps the current user view to the gRPC response', async () => {
    queryExecute.mockResolvedValue({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: ['google', 'github'],
      createdAt: new Date('2026-08-21T10:15:00.000Z'),
    });

    await expect(controller.getCurrentUser({ userId: 42 })).resolves.toEqual({
      id: 42,
      username: 'client123',
      email: 'user@example.com',
      emailVerified: true,
      hasPassword: true,
      oauthProviders: [OAuthProvider.OAUTH_PROVIDER_GOOGLE, OAuthProvider.OAUTH_PROVIDER_GITHUB],
      createdAt: '2026-08-21T10:15:00.000Z',
    });
    expect(queryExecute).toHaveBeenCalledOnce();
    const query = queryExecute.mock.calls[0]?.[0] as GetCurrentUserQuery;
    expect(query).toBeInstanceOf(GetCurrentUserQuery);
    expect(query.userId).toBe(42);
  });

  describe('updateProfileInfo', () => {
    it('maps a complete request to UpdateProfileInfoCommand and returns an empty response', async () => {
      commandExecute.mockResolvedValue(undefined);

      await expect(controller.updateProfileInfo(validUpdateRequest)).resolves.toEqual({});

      expect(commandExecute).toHaveBeenCalledOnce();
      const command = commandExecute.mock.calls[0]?.[0] as UpdateProfileInfoCommand;
      expect(command).toBeInstanceOf(UpdateProfileInfoCommand);
      expect(command.props).toEqual({
        userId: 1,
        username: 'ivanovich',
        personalInfo: {
          firstName: 'Ivan',
          lastName: 'Ivanovich',
          dateOfBirth: '1990-01-15',
          aboutMe: 'Backend developer',
          countryCode: 'UA',
          city: 'Kyiv',
        },
      });
    });

    it('maps omitted optional profile fields to null', async () => {
      const request: UpdateProfileInfoRequest = {
        userId: 42,
        username: 'username',
        personalInfo: { firstName: 'John', lastName: 'Doe' },
      };

      await controller.updateProfileInfo(request);

      const command = commandExecute.mock.calls[0]?.[0] as UpdateProfileInfoCommand;
      expect(command.props).toEqual({
        userId: 42,
        username: 'username',
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: null,
          aboutMe: null,
          countryCode: null,
          city: null,
        },
      });
    });

    it('maps runtime null optional profile fields to command null', async () => {
      const request = {
        ...validUpdateRequest,
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: null,
          aboutMe: null,
          countryCode: null,
          city: null,
        },
      } as unknown as UpdateProfileInfoRequest;

      await controller.updateProfileInfo(request);

      const command = commandExecute.mock.calls[0]?.[0] as UpdateProfileInfoCommand;
      expect(command.props.personalInfo).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: null,
        aboutMe: null,
        countryCode: null,
        city: null,
      });
    });

    it.each([0, -1, 1.5, Number.NaN, 2_147_483_647])(
      'rejects invalid userId %s without executing a command',
      async (userId) => {
        const promise = controller.updateProfileInfo({ ...validUpdateRequest, userId });

        await expectInvalidArgument(promise, 'Invalid userId');
        expect(commandExecute).not.toHaveBeenCalled();
      },
    );

    it('rejects a missing personalInfo without executing a command', async () => {
      const promise = controller.updateProfileInfo({
        ...validUpdateRequest,
        personalInfo: undefined,
      });

      await expectInvalidArgument(promise, 'Filed personalInfo is required');
      expect(commandExecute).not.toHaveBeenCalled();
    });

    it('rejects a runtime null personalInfo without executing a command', async () => {
      const request = { ...validUpdateRequest, personalInfo: null } as unknown as UpdateProfileInfoRequest;

      await expectInvalidArgument(controller.updateProfileInfo(request), 'Filed personalInfo is required');
      expect(commandExecute).not.toHaveBeenCalled();
    });

    it('accepts a valid numeric id and executes the command exactly once', async () => {
      await controller.updateProfileInfo({ ...validUpdateRequest, userId: 42 });

      expect(commandExecute).toHaveBeenCalledOnce();
      const command = commandExecute.mock.calls[0]?.[0] as UpdateProfileInfoCommand;
      expect(command.props.userId).toBe(42);
    });

    it('propagates a command/domain error unchanged', async () => {
      const error = new Error('domain failure');
      commandExecute.mockRejectedValue(error);

      await expect(controller.updateProfileInfo(validUpdateRequest)).rejects.toBe(error);
      expect(commandExecute).toHaveBeenCalledOnce();
    });
  });

  describe('profile reads', () => {
    it('maps every private profile field to the gRPC response', async () => {
      queryExecute.mockResolvedValue({
        userId: 42,
        username: 'username',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        aboutMe: 'About me',
        countryCode: 'UA',
        city: 'Kyiv',
        avatarFileId: 'avatar-id',
      });

      await expect(controller.getMyProfile({ userId: 42 })).resolves.toEqual({
        userId: 42,
        username: 'username',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-15',
        aboutMe: 'About me',
        countryCode: 'UA',
        city: 'Kyiv',
        avatarFileId: 'avatar-id',
      });
      const query = queryExecute.mock.calls[0]?.[0] as GetMyProfileQuery;
      expect(query).toBeInstanceOf(GetMyProfileQuery);
      expect(query.userId).toBe(42);
    });

    it('maps private null optionals to omitted gRPC fields', async () => {
      queryExecute.mockResolvedValue({
        userId: 7,
        username: 'username',
        firstName: null,
        lastName: null,
        dateOfBirth: null,
        aboutMe: null,
        countryCode: null,
        city: null,
        avatarFileId: null,
      });

      await expect(controller.getMyProfile({ userId: 7 })).resolves.toEqual({
        userId: 7,
        username: 'username',
        firstName: undefined,
        lastName: undefined,
        dateOfBirth: undefined,
        aboutMe: undefined,
        countryCode: undefined,
        city: undefined,
        avatarFileId: undefined,
      });
    });

    it('maps only public profile fields', async () => {
      queryExecute.mockResolvedValue({
        userId: 42,
        username: 'username',
        aboutMe: 'Public bio',
        avatarFileId: 'avatar-id',
      });

      const result = await controller.getPublicProfile({ userId: 42 });

      expect(result).toEqual({
        userId: 42,
        username: 'username',
        aboutMe: 'Public bio',
        avatarFileId: 'avatar-id',
      });
      expect(result).not.toHaveProperty('firstName');
      expect(result).not.toHaveProperty('dateOfBirth');
      const query = queryExecute.mock.calls[0]?.[0] as GetPublicProfileQuery;
      expect(query).toBeInstanceOf(GetPublicProfileQuery);
      expect(query.userId).toBe(42);
    });

    it.each([
      ['private', (userId: number) => controller.getMyProfile({ userId })],
      ['public', (userId: number) => controller.getPublicProfile({ userId })],
    ] as const)('rejects invalid %s profile id without executing a query', async (_type, invoke) => {
      await expectInvalidArgument(invoke(0), 'Invalid userId');
      expect(queryExecute).not.toHaveBeenCalled();
    });

    it.each([
      ['private', () => controller.getMyProfile({ userId: 42 })],
      ['public', () => controller.getPublicProfile({ userId: 42 })],
    ] as const)('propagates a %s profile query error', async (_type, invoke) => {
      const error = new Error('query failed');
      queryExecute.mockRejectedValue(error);

      await expect(invoke()).rejects.toBe(error);
      expect(queryExecute).toHaveBeenCalledOnce();
    });
  });
});

async function expectInvalidArgument(promise: Promise<unknown>, message: string): Promise<void> {
  try {
    await promise;
    expect.fail('Expected an RpcException');
  } catch (error) {
    expect(error).toBeInstanceOf(RpcException);
    expect((error as RpcException).getError()).toEqual({ code: status.INVALID_ARGUMENT, message });
  }
}
