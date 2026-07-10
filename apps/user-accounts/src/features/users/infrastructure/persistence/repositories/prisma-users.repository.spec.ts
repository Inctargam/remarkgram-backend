import { Prisma } from '../../../../../database/generated/client.js';
import type { PrismaService } from '../../../../../database/prisma.service.js';
import {
  EmailAlreadyExistsError,
  UsernameAlreadyExistsError,
} from '../../../application/errors/users.errors.js';
import type { CreateUserRepositoryParams } from '../../../application/types/users.types.js';
import { ConfirmationInfo } from '../../../domain/value-objects/confirmation-info.js';
import { PrismaUsersRepository } from './prisma-users.repository.js';

describe('PrismaUsersRepository', () => {
  const create = vi.fn();
  const updateMany = vi.fn();
  const executeRaw = vi.fn();
  const prisma = { user: { create, updateMany }, $executeRaw: executeRaw };
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
});
