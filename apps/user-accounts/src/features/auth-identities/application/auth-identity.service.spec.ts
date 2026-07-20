import { describe, expect, it, vi } from 'vitest';
import type { UnitOfWork } from '../../../common/application/unit-of-work.js';
import type { UsersRepository } from '../../users/application/ports/users.repository.js';
import { User } from '../../users/domain/entities/user.entity.js';
import { ConfirmationInfo } from '../../users/domain/value-objects/confirmation-info.js';
import { AuthIdentity } from '../domain/auth-identity.entity.js';
import {
  OAuthEmailConfirmationRequiredError,
  OAuthEmailNotVerifiedError,
  OAuthEmailRequiredError,
  OAuthIdentityOwnerNotFoundError,
} from './errors/auth-identity.errors.js';
import { AuthIdentityService } from './auth-identity.service.js';
import {
  type AuthenticateOAuthServiceParams,
  AuthenticateOAuthStatus,
} from './types/auth-identities.types.js';

const params: AuthenticateOAuthServiceParams = {
  provider: 'github',
  providerSubject: 'github-42',
  username: 'octocat',
  avatarUrl: 'https://avatars.example.com/octocat.png',
  emails: [{ email: 'octocat@example.com', verified: true, primary: true }],
};
const primaryEmail = params.emails[0];

const user = User.restore({
  id: 1,
  username: 'user1',
  email: 'octocat@example.com',
  hash: null,
  createdAt: new Date('2026-07-14T00:00:00.000Z'),
  confirmation: ConfirmationInfo.confirmed(),
  deletedAt: null,
});

function createService() {
  const identityRepository = {
    findAuthIdentity: vi.fn(),
    findByUserAndProvider: vi.fn(),
    createIfAbsent: vi.fn(),
    updateProviderProfile: vi.fn(),
  };
  const userRepository = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    createOAuth: vi.fn<UsersRepository['createOAuth']>(),
    confirmForOAuth: vi.fn(),
  };
  const unitOfWork = {
    run: vi.fn<UnitOfWork['run']>((handler) => handler('transaction-context')),
  };

  return {
    service: new AuthIdentityService(
      identityRepository,
      userRepository as unknown as UsersRepository,
      unitOfWork as unknown as UnitOfWork,
      { confirmationCodeExpiresIn: 24 } as never,
    ),
    identityRepository,
    userRepository,
    unitOfWork,
  };
}

describe('AuthIdentityService', () => {
  it('resolves an existing identity by its userId', async () => {
    const { service, identityRepository, userRepository } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: true,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    userRepository.findById.mockResolvedValue(user);

    await expect(service.authenticateOAuth(params)).resolves.toEqual({
      status: AuthenticateOAuthStatus.SIGNED_IN,
      user,
    });
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
    expect(identityRepository.updateProviderProfile).not.toHaveBeenCalled();
  });

  it('synchronizes a changed provider profile for an existing identity', async () => {
    const { service, identityRepository, userRepository } = createService();
    const identity = AuthIdentity.restore({
      id: crypto.randomUUID(),
      userId: user.id,
      provider: params.provider,
      providerSubject: params.providerSubject,
      providerEmail: 'old@example.com',
      providerEmailVerified: false,
      username: 'old-octocat',
      avatarUrl: 'https://avatars.example.com/old-octocat.png',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    identityRepository.findAuthIdentity.mockResolvedValue(identity);
    userRepository.findById.mockResolvedValue(user);

    await expect(service.authenticateOAuth(params)).resolves.toEqual({
      status: AuthenticateOAuthStatus.SIGNED_IN,
      user,
    });
    expect(identityRepository.updateProviderProfile).toHaveBeenCalledWith(
      {
        identityId: identity.id,
        providerEmail: primaryEmail.email,
        providerEmailVerified: primaryEmail.verified,
        username: params.username,
        avatarUrl: params.avatarUrl,
      },
      'transaction-context',
    );
  });

  it('links an identity when the verified email belongs to a local user', async () => {
    const { service, identityRepository, userRepository } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(null);
    identityRepository.createIfAbsent.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: true,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    userRepository.findByEmail.mockResolvedValue(user);

    await expect(service.authenticateOAuth(params)).resolves.toEqual({
      status: AuthenticateOAuthStatus.IDENTITY_LINKED,
      user,
    });
    expect(identityRepository.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        providerSubject: params.providerSubject,
        username: params.username,
        avatarUrl: params.avatarUrl,
      }),
      'transaction-context',
    );
  });

  it('creates an OAuth user and identity in the same transaction', async () => {
    const { service, identityRepository, userRepository, unitOfWork } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.createOAuth.mockResolvedValue(user);
    identityRepository.createIfAbsent.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: true,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await expect(service.authenticateOAuth(params)).resolves.toEqual({
      status: AuthenticateOAuthStatus.REGISTERED,
      user,
    });
    expect(unitOfWork.run).toHaveBeenCalledOnce();
    expect(userRepository.createOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ email: primaryEmail.email }),
      'transaction-context',
    );
    expect(identityRepository.createIfAbsent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        providerSubject: params.providerSubject,
        username: params.username,
        avatarUrl: params.avatarUrl,
      }),
      'transaction-context',
    );
  });

  it('does not link an existing user by an unverified provider email', async () => {
    const { service, identityRepository, userRepository } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(user);

    await expect(
      service.authenticateOAuth({
        ...params,
        emails: [{ ...primaryEmail, verified: false }],
      }),
    ).rejects.toBeInstanceOf(OAuthEmailNotVerifiedError);
    expect(userRepository.createOAuth).not.toHaveBeenCalled();
  });

  it('rejects a new identity when the provider does not return a primary email', async () => {
    const { service, identityRepository, userRepository } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(null);

    await expect(service.authenticateOAuth({ ...params, emails: [] })).rejects.toBeInstanceOf(
      OAuthEmailRequiredError,
    );
    expect(userRepository.findByEmail).not.toHaveBeenCalled();
  });

  it('registers an unconfirmed user when a new provider email is not verified', async () => {
    const { service, identityRepository, userRepository } = createService();
    const pendingUser = User.restore({
      ...user,
      confirmation: ConfirmationInfo.pending('confirmation-code', new Date('2026-07-15T00:00:00.000Z')),
    });
    const unverifiedParams: AuthenticateOAuthServiceParams = {
      ...params,
      emails: [{ ...primaryEmail, verified: false }],
    };
    identityRepository.findAuthIdentity.mockResolvedValue(null);
    userRepository.findByEmail.mockResolvedValue(null);
    userRepository.createOAuth.mockResolvedValue(pendingUser);
    identityRepository.createIfAbsent.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: pendingUser.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: false,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await expect(service.authenticateOAuth(unverifiedParams)).resolves.toEqual({
      status: AuthenticateOAuthStatus.REGISTERED_EMAIL_CONFIRMATION_REQUIRED,
      user: pendingUser,
    });
    expect(userRepository.createOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        email: primaryEmail.email,
      }),
      'transaction-context',
    );
    expect(userRepository.createOAuth.mock.calls[0]?.[0].confirmation.isConfirmed).toBe(false);
  });

  it('rejects sign-in when an existing identity has no active owner', async () => {
    const { service, identityRepository, userRepository } = createService();
    identityRepository.findAuthIdentity.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: true,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    userRepository.findById.mockResolvedValue(null);

    await expect(service.authenticateOAuth(params)).rejects.toBeInstanceOf(OAuthIdentityOwnerNotFoundError);
  });

  it('requires confirmation when the identity owner email is not verified by the provider', async () => {
    const { service, identityRepository, userRepository } = createService();
    const pendingUser = User.restore({
      ...user,
      confirmation: ConfirmationInfo.pending('confirmation-code', new Date('2026-07-15T00:00:00.000Z')),
    });
    identityRepository.findAuthIdentity.mockResolvedValue(
      AuthIdentity.restore({
        id: crypto.randomUUID(),
        userId: pendingUser.id,
        provider: params.provider,
        providerSubject: params.providerSubject,
        providerEmail: primaryEmail.email,
        providerEmailVerified: false,
        username: params.username,
        avatarUrl: params.avatarUrl,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    userRepository.findById.mockResolvedValue(pendingUser);

    await expect(
      service.authenticateOAuth({
        ...params,
        emails: [{ ...primaryEmail, verified: false }],
      }),
    ).rejects.toBeInstanceOf(OAuthEmailConfirmationRequiredError);
    expect(userRepository.confirmForOAuth).not.toHaveBeenCalled();
  });
});
