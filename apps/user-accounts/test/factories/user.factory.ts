import { User, type UserProps } from '../../src/features/users/domain/entities/user.entity.js';
import { ConfirmationInfo } from '../../src/features/users/domain/value-objects/confirmation-info.js';

export const createTestUser = (overrides: Partial<UserProps> = {}): User =>
  User.restore({
    id: 1,
    username: 'user',
    email: 'user@example.com',
    hash: 'hash',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    confirmation: ConfirmationInfo.confirmed(),
    deletedAt: null,
    ...overrides,
  });
