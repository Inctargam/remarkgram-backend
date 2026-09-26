import { Prisma } from '../../../../../database/generated/client.js';
import type { PrismaService } from '../../../../../database/prisma.service.js';
import {
  EmailAlreadyExistsError,
  UsernameAlreadyExistsError,
  UserNotFoundError,
} from '../../../application/errors/users.errors.js';
import type {
  CreateUserRepositoryParams,
  UpdateProfileInfoRepositoryParams,
} from '../../../application/types/users.types.js';
import { ConfirmationInfo } from '../../../domain/value-objects/confirmation-info.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';
import { expect } from 'vitest';
import { PersonalInfo } from '../../../domain/value-objects/personal-info.js';

describe('PrismaUsersRepository', () => {
  const create = vi.fn();
  const updateMany = vi.fn();
  const executeRaw = vi.fn();
  const update = vi.fn();
  const prisma = { user: { create, updateMany, update }, $executeRaw: executeRaw };
  const repository = new PrismaUsersRepository(prisma as unknown as PrismaService);
  const params: CreateUserRepositoryParams = {
    username: 'user_123',
    email: 'user@example.com',
    hash: 'password-hash',
    createdAt: new Date('2026-07-06T12:00:00.000Z'),
    confirmation: ConfirmationInfo.pending('confirmation-code', new Date('2026-07-06T13:00:00.000Z')),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('soft-deletes expired unconfirmed users that reserve the requested credentials', async () => {
    const now = new Date('2026-07-06T12:00:00.000Z');
    updateMany.mockResolvedValue({ count: 2 });

    await repository.releaseExpiredRegistrationCredentials({
      username: 'user_123',
      email: 'user@example.com',
      now,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        deletedAt: null,
        isConfirmed: false,
        confirmationExpiration: { lte: now },
        OR: [{ username: 'user_123' }, { email: 'user@example.com' }],
      },
      data: { deletedAt: now },
    });
  });

  it('soft-deletes an expired password registration by email inside the provided transaction', async () => {
    const now = new Date('2026-07-06T12:00:00.000Z');
    const transactionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transactionContext = {
      user: {
        updateMany: transactionUpdateMany,
      },
    };

    await repository.releaseExpiredRegistrationByEmail(
      {
        email: 'user@example.com',
        now,
      },
      transactionContext,
    );

    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: {
        email: 'user@example.com',
        deletedAt: null,
        isConfirmed: false,
        confirmationExpiration: { lte: now },
        providers: { none: {} },
      },
      data: { deletedAt: now },
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('clears confirmation code and expiration when confirming a user', async () => {
    executeRaw.mockResolvedValue(1);

    await expect(repository.confirmUser('confirmation-code')).resolves.toBe(true);
    expect(executeRaw).toHaveBeenCalledOnce();
    expect(executeRaw.mock.calls[0][1]).toBe('confirmation-code');
  });

  it('reports that the user was not confirmed when no row was updated', async () => {
    executeRaw.mockResolvedValue(0);

    await expect(repository.confirmUser('confirmation-code')).resolves.toBe(false);
  });

  it('updates a confirmation code only for an unconfirmed user', async () => {
    const expiration = new Date('2026-07-06T13:00:00.000Z');
    updateMany.mockResolvedValue({ count: 1 });

    await expect(
      repository.updateConfirmationCode({
        userId: 1,
        expectedCode: 'old-confirmation-code',
        newCode: 'new-confirmation-code',
        expiration,
      }),
    ).resolves.toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        confirmationCode: 'new-confirmation-code',
        confirmationExpiration: expiration,
      },
      where: {
        id: 1,
        confirmationCode: 'old-confirmation-code',
        isConfirmed: false,
        deletedAt: null,
      },
    });
  });

  it('reports that confirmation-code update lost a race when no unconfirmed row was updated', async () => {
    updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.updateConfirmationCode({
        userId: 1,
        expectedCode: 'old-confirmation-code',
        newCode: 'new-confirmation-code',
        expiration: new Date('2026-07-06T13:00:00.000Z'),
      }),
    ).resolves.toBe(false);
  });

  it.each([
    ['username', UsernameAlreadyExistsError],
    ['email', EmailAlreadyExistsError],
  ] as const)('maps a %s unique constraint violation to an application error', async (field, ErrorType) => {
    create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: '7.8.0',
        meta: {
          driverAdapterError: {
            cause: {
              constraint: { fields: [field] },
            },
          },
        },
      }),
    );

    await expect(repository.create(params)).rejects.toBeInstanceOf(ErrorType);
  });

  it('does not hide an unrelated persistence error', async () => {
    const error = new Error('Database is unavailable');
    create.mockRejectedValue(error);

    await expect(repository.create(params)).rejects.toBe(error);
  });

  describe('updateProfileInfo', () => {
    const fullParams: UpdateProfileInfoRepositoryParams = {
      userId: 1,
      username: 'ivanovich',
      personalInfo: PersonalInfo.create({
        firstName: 'Ivan',
        lastName: 'Ivanovich',
        dateOfBirth: '2010-02-09',
        aboutMe: 'About Me',
        countryCode: 'US',
        city: 'New York',
      }),
    };

    it('atomically updates username and upserts every profile field', async () => {
      update.mockResolvedValue({});
      const profileData = {
        firstName: 'Ivan',
        lastName: 'Ivanovich',
        dateOfBirth: new Date(Date.UTC(2010, 1, 9)),
        aboutMe: 'About Me',
        countryCode: 'US',
        city: 'New York',
      };

      await expect(repository.updateProfileInfo(fullParams)).resolves.toBeUndefined();

      expect(update).toHaveBeenCalledOnce();
      expect(update).toHaveBeenCalledWith({
        where: { id: 1, deletedAt: null },
        data: {
          username: 'ivanovich',
          profile: {
            upsert: {
              create: profileData,
              update: profileData,
            },
          },
        },
      });
    });

    it('writes null to both upsert branches when optional fields are cleared', async () => {
      update.mockResolvedValue({});
      const params: UpdateProfileInfoRepositoryParams = {
        userId: 2,
        username: 'updated_user',
        personalInfo: PersonalInfo.create({
          firstName: 'John',
          lastName: 'Doe',
          dateOfBirth: null,
          aboutMe: null,
          countryCode: null,
          city: null,
        }),
      };
      const profileData = {
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: null,
        aboutMe: null,
        countryCode: null,
        city: null,
      };

      await repository.updateProfileInfo(params);

      expect(update).toHaveBeenCalledOnce();
      expect(update).toHaveBeenCalledWith({
        where: { id: 2, deletedAt: null },
        data: {
          username: 'updated_user',
          profile: { upsert: { create: profileData, update: profileData } },
        },
      });
    });

    it('maps a username P2002 violation to UsernameAlreadyExistsError', async () => {
      update.mockRejectedValue(createKnownPrismaError('P2002', ['username']));

      await expect(repository.updateProfileInfo(fullParams)).rejects.toBeInstanceOf(
        UsernameAlreadyExistsError,
      );
    });

    it('does not misclassify an unknown P2002 constraint as a username conflict', async () => {
      const error = createKnownPrismaError('P2002', ['someOtherUniqueField']);
      update.mockRejectedValue(error);

      await expect(repository.updateProfileInfo(fullParams)).rejects.toBe(error);
    });

    it('maps P2025 to UserNotFoundError for a missing or deleted user', async () => {
      update.mockRejectedValue(createKnownPrismaError('P2025'));

      await expect(repository.updateProfileInfo(fullParams)).rejects.toBeInstanceOf(UserNotFoundError);
      expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 1, deletedAt: null } }));
    });

    it('propagates an unrelated Prisma error', async () => {
      const error = createKnownPrismaError('P2003');
      update.mockRejectedValue(error);

      await expect(repository.updateProfileInfo(fullParams)).rejects.toBe(error);
    });

    it('propagates an unknown persistence error', async () => {
      const error = new Error('Database is unavailable');
      update.mockRejectedValue(error);

      await expect(repository.updateProfileInfo(fullParams)).rejects.toBe(error);
    });
  });
});

function createKnownPrismaError(code: string, fields?: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Prisma request failed', {
    code,
    clientVersion: '7.8.0',
    meta: fields === undefined ? undefined : { driverAdapterError: { cause: { constraint: { fields } } } },
  });
}
