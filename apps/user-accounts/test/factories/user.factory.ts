import { User, type UserProps } from '../../src/features/users/domain/entities/user.entity.js';

export const createTestUser = (overrides: Partial<UserProps> = {}): User =>
  User.restore({
    id: 1,
    username: 'user',
    email: 'user@example.com',
    hash: 'hash',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    confirmation: {
      isConfirmed: true,
      code: null,
      expiration: null,
    },
    passwordRecovery: {
      code: null,
      expiration: null,
    },
    deletedAt: null,
    ...overrides,
  });
