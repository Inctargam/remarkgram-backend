import type { SessionsService } from '../../../sessions/application/sessions.service.js';
import type { AuthService } from '../auth.service.js';
import type { AuthIdentityService } from '../../../auth-identities/application/auth-identity.service.js';
import type { EventBus } from '@nestjs/cqrs';
import { AuthenticateOAuthCommand, AuthenticateOAuthUseCase } from './authenticate-oauth.use-case.js';
import type { SessionRequestContext } from '../types/auth.types.js';
import {
  AuthenticateOAuthStatus,
  type AuthenticateOAuthServiceParams,
} from '../../../auth-identities/application/types/auth-identities.types.js';
import { createTestUser } from '../../../../../test/factories/user.factory.js';
import { ConfirmationInfo } from '../../../users/domain/value-objects/confirmation-info.js';
import { OAuthEmailConfirmationRequiredError } from '../../../auth-identities/application/errors/auth-identity.errors.js';
import { RegistrationConfirmationEmailEvent } from '../../../notifications/use-cases/registration-confirmation-email.event-use-case.js';
import { OAuthRegistrationSuccessEmailEvent } from '../../../notifications/use-cases/oauth-registration-success-email.event-use-case.js';

function createDependency() {
  const authService = {
    generateTokenPair: vi.fn<AuthService['generateTokenPair']>(),
  };
  const authIdentityService = {
    authenticateOAuth: vi.fn<AuthIdentityService['authenticateOAuth']>(),
  };

  const sessionsService = {
    // checkSession: vi.fn<SessionsService['checkSession']>(),
    createAuthenticatedSession: vi.fn<SessionsService['createAuthenticatedSession']>(),
  };

  const eventBus = {
    publish: vi.fn<EventBus['publish']>(),
  };

  const useCase = new AuthenticateOAuthUseCase(
    authIdentityService as unknown as AuthIdentityService,
    authService as unknown as AuthService,
    sessionsService as unknown as SessionsService,
    eventBus as unknown as EventBus,
  );

  return {
    authService,
    authIdentityService,
    sessionsService,
    eventBus,
    useCase,
  };
}

describe('AuthenticateOAuthUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const sessionContext: SessionRequestContext = {
    ip: '127.0.0.1',
    deviceName: 'Mozilla',
  };

  const oauthProvider: AuthenticateOAuthServiceParams = {
    provider: 'github',
    providerSubject: 'github-123',
    emails: [{ email: 'test@email.com', verified: true, primary: true }],
  };
  const user = createTestUser({
    email: 'test@email.com',
  });
  const tokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    refreshTokenPayload: {
      sub: '1',
      aud: 'auth',
      sessionId: 'e3637e61-194b-4f79-9676-e59a20bb7c42',
      jti: 'new-jti',
      iat: 100,
      exp: 200,
    },
  };

  const { useCase, authIdentityService, sessionsService, authService, eventBus } = createDependency();

  it('success singed by existing providerId', async () => {
    authIdentityService.authenticateOAuth.mockResolvedValue({
      status: AuthenticateOAuthStatus.SIGNED_IN,
      user,
    });

    authService.generateTokenPair.mockResolvedValue(tokenPair);
    sessionsService.createAuthenticatedSession.mockResolvedValue(true);

    await expect(
      useCase.execute(new AuthenticateOAuthCommand(sessionContext, oauthProvider)),
    ).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });

    expect(authIdentityService.authenticateOAuth).toHaveBeenCalledWith(oauthProvider);
    expect(sessionsService.createAuthenticatedSession).toHaveBeenCalledOnce();
  });

  it('success LINKED verified identity by existing verified user', async () => {
    authIdentityService.authenticateOAuth.mockResolvedValue({
      status: AuthenticateOAuthStatus.IDENTITY_LINKED,
      user,
    });

    authService.generateTokenPair.mockResolvedValue(tokenPair);
    sessionsService.createAuthenticatedSession.mockResolvedValue(true);

    await expect(
      useCase.execute(new AuthenticateOAuthCommand(sessionContext, oauthProvider)),
    ).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });

    expect(authIdentityService.authenticateOAuth).toHaveBeenCalledWith(oauthProvider);
    expect(sessionsService.createAuthenticatedSession).toHaveBeenCalledOnce();
  });

  it('creates a session and publishes a welcome event after confirmed registration', async () => {
    authIdentityService.authenticateOAuth.mockResolvedValue({
      status: AuthenticateOAuthStatus.REGISTERED,
      user,
    });
    authService.generateTokenPair.mockResolvedValue(tokenPair);
    sessionsService.createAuthenticatedSession.mockResolvedValue(true);

    await expect(
      useCase.execute(new AuthenticateOAuthCommand(sessionContext, oauthProvider)),
    ).resolves.toEqual({
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    });
    expect(eventBus.publish).toHaveBeenCalledWith(
      new OAuthRegistrationSuccessEmailEvent(user.email, oauthProvider.provider),
    );
    expect(sessionsService.createAuthenticatedSession).toHaveBeenCalledOnce();
  });

  it('sends a confirmation email and does not create a session for pending registration', async () => {
    const pendingUser = createTestUser({
      email: 'test@email.com',
      confirmation: ConfirmationInfo.pending('confirmation-code', new Date('2026-07-15T00:00:00.000Z')),
    });
    authIdentityService.authenticateOAuth.mockResolvedValue({
      status: AuthenticateOAuthStatus.REGISTERED_EMAIL_CONFIRMATION_REQUIRED,
      user: pendingUser,
    });

    await expect(
      useCase.execute(new AuthenticateOAuthCommand(sessionContext, oauthProvider)),
    ).rejects.toBeInstanceOf(OAuthEmailConfirmationRequiredError);
    expect(eventBus.publish).toHaveBeenCalledWith(
      new RegistrationConfirmationEmailEvent(pendingUser.email, 'confirmation-code'),
    );
    expect(authService.generateTokenPair).not.toHaveBeenCalled();
    expect(sessionsService.createAuthenticatedSession).not.toHaveBeenCalled();
  });
});
