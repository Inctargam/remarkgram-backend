import { Command, CommandHandler, EventBus, type ICommandHandler } from '@nestjs/cqrs';
import { AuthIdentityService } from '../../../auth-identities/application/auth-identity.service.js';
import {
  type AuthenticateOAuthServiceParams,
  AuthenticateOAuthStatus,
} from '../../../auth-identities/application/types/auth-identities.types.js';
import { SessionsService } from '../../../sessions/application/sessions.service.js';
import { OAuthRegistrationSuccessEmailEvent } from '../../../notifications/use-cases/oauth-registration-success-email.event-use-case.js';
import { RegistrationConfirmationEmailEvent } from '../../../notifications/use-cases/registration-confirmation-email.event-use-case.js';
import { OAuthEmailConfirmationRequiredError } from '../../../auth-identities/application/errors/auth-identity.errors.js';
import { AuthService } from '../auth.service.js';
import { OAuthSessionCreationFailedError } from '../errors/auth.errors.js';
import type { JwtPair, SessionRequestContext } from '../types/auth.types.js';

export class AuthenticateOAuthCommand extends Command<JwtPair> {
  constructor(
    public readonly sessionContext: SessionRequestContext,
    public readonly oauth: AuthenticateOAuthServiceParams,
  ) {
    super();
  }
}

@CommandHandler(AuthenticateOAuthCommand)
export class AuthenticateOAuthUseCase implements ICommandHandler<AuthenticateOAuthCommand> {
  constructor(
    private readonly authIdentityService: AuthIdentityService,
    private readonly authService: AuthService,
    private readonly sessionsService: SessionsService,
    private readonly eventBus: EventBus,
  ) {}

  async execute(command: AuthenticateOAuthCommand): Promise<JwtPair> {
    const { oauth, sessionContext } = command;

    const result = await this.authIdentityService.authenticateOAuth(oauth);

    switch (result.status) {
      case AuthenticateOAuthStatus.SIGNED_IN:
      case AuthenticateOAuthStatus.IDENTITY_LINKED:
        return this.createSession(result.user.id.toString(), sessionContext);
      case AuthenticateOAuthStatus.REGISTERED:
        this.eventBus.publish(new OAuthRegistrationSuccessEmailEvent(result.user.email, oauth.provider));
        return this.createSession(result.user.id.toString(), sessionContext);
      case AuthenticateOAuthStatus.REGISTERED_EMAIL_CONFIRMATION_REQUIRED: {
        const confirmationCode = result.user.confirmation.code;
        if (!confirmationCode) {
          throw new Error('OAuth registration requires a confirmation code');
        }

        // Пользователь уже зарегистрирован, но сессию создаём только после подтверждения его email.
        this.eventBus.publish(new RegistrationConfirmationEmailEvent(result.user.email, confirmationCode));
        throw new OAuthEmailConfirmationRequiredError();
      }
    }
  }

  private async createSession(userId: string, context: SessionRequestContext): Promise<JwtPair> {
    const sessionId = crypto.randomUUID();
    const { accessToken, refreshToken, refreshTokenPayload } = await this.authService.generateTokenPair({
      userId,
      sessionId,
    });

    const wasCreated = await this.sessionsService.createAuthenticatedSession({
      userId,
      sessionId,
      deviceName: context.deviceName,
      ip: context.ip,
      jti: refreshTokenPayload.jti,
      lastActiveAt: new Date(refreshTokenPayload.iat * 1000),
      expiresAt: new Date(refreshTokenPayload.exp * 1000),
    });

    if (!wasCreated) throw new OAuthSessionCreationFailedError();

    return { accessToken, refreshToken };
  }
}
