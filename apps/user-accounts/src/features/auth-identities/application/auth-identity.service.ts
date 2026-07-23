import { Inject, Injectable, Logger } from '@nestjs/common';
import type { TransactionContext } from '../../../common/application/unit-of-work.js';
import { UnitOfWork } from '../../../common/application/unit-of-work.js';
import type { User } from '../../users/domain/entities/user.entity.js';
import { UsersRepository } from '../../users/application/ports/users.repository.js';
import { ConfirmationInfo } from '../../users/domain/value-objects/confirmation-info.js';
import type { AuthIdentity, AuthIdentityProvider } from '../domain/auth-identity.entity.js';
import {
  OAuthEmailConfirmationRequiredError,
  OAuthEmailNotVerifiedError,
  OAuthEmailRequiredError,
  OAuthIdentityLinkedToAnotherUserError,
  OAuthIdentityOwnerNotFoundError,
  OAuthProviderAlreadyLinkedError,
  UnexpectedOAuthIdentityConflictError,
} from './errors/auth-identity.errors.js';
import { AuthIdentitiesRepository } from './ports/auth-identities-repository.js';
import {
  type AuthenticateOAuthServiceParams,
  type AuthenticateOAuthServiceResult,
  AuthenticateOAuthStatus,
  type OAuthEmail,
} from './types/auth-identities.types.js';
import { authConfig } from '../../../config/auth.config.ts';
import type { ConfigType } from '@nestjs/config';
import { normalizeEmail } from '../../users/domain/email-normalization.js';

type OAuthIdentityContext = {
  email: string;
  verified: boolean;
  subject: string;
  provider: AuthIdentityProvider;
  username: string | null;
  avatarUrl: string | null;
};

@Injectable()
export class AuthIdentityService {
  readonly logger: Logger = new Logger(AuthIdentityService.name);
  constructor(
    private readonly identityRepository: AuthIdentitiesRepository,
    private readonly userRepository: UsersRepository,
    private readonly unitOfWork: UnitOfWork,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}
  private getPrimaryEmail(emails: OAuthEmail[]): OAuthEmail | null {
    const primary = emails.find((e) => e.primary);
    if (!primary) {
      return null;
    }
    return primary;
  }

  private throwOAuthEmailNotVerified(): never {
    // Неподтверждённый email нельзя использовать для автоматического объединения аккаунтов.
    throw new OAuthEmailNotVerifiedError();
  }

  /** Определяет бизнес-сценарий OAuth: вход, привязка провайдера или регистрация. */
  async authenticateOAuth(params: AuthenticateOAuthServiceParams): Promise<AuthenticateOAuthServiceResult> {
    const identity = await this.identityRepository.findAuthIdentity(params.providerSubject, params.provider);

    const normalizedEmails = params.emails.map((email) => ({
      ...email,
      email: normalizeEmail(email.email),
    }));
    const primaryEmail = this.getPrimaryEmail(normalizedEmails);
    const oauthIdentity: OAuthIdentityContext = {
      provider: params.provider,
      subject: params.providerSubject,
      email: primaryEmail?.email ?? '',
      verified: primaryEmail?.verified ?? false,
      username: params.username ?? null,
      avatarUrl: params.avatarUrl ?? null,
    };

    if (identity) {
      return this.signInByExistingIdentity(identity, oauthIdentity, normalizedEmails);
    }

    if (!primaryEmail?.email.trim()) {
      // Без primary email невозможно зарегистрировать пользователя или безопасно найти локальный аккаунт.
      throw new OAuthEmailRequiredError();
    }

    return this.unitOfWork.run(async (ctx) => {
      const now = new Date();

      // Просроченная неподтверждённая password-регистрация не должна удерживать email.
      // Удаление, повторный поиск и создание OAuth-пользователя выполняются атомарно.
      await this.userRepository.releaseExpiredRegistrationByEmail(
        {
          email: primaryEmail.email,
          now,
        },
        ctx,
      );

      // Неподтверждённый email нельзя использовать для автоматической привязки аккаунта.
      const user = await this.userRepository.findByEmail(primaryEmail.email, ctx);

      if (user) {
        return primaryEmail.verified
          ? // пользователь найден + email verified → привязываем identity;
            this.linkIdentityToExistingUser(user, oauthIdentity, ctx)
          : // пользователь найден + email unverified → не объединяем аккаунты;
            this.throwOAuthEmailNotVerified();
      }

      // TODO: Обработать конкурентное создание OAuth-пользователя. Между findByEmail и INSERT другой запрос
      // может создать пользователя с тем же email. Нужно определить единый доменный сценарий обработки
      // конфликта уникальности и не возвращать наружу инфраструктурную ошибку Prisma.
      return this.registerOAuthUser(oauthIdentity, now, ctx);
    });
  }

  /** Выполняет вход по identity, которая уже принадлежит локальному пользователю. */
  private async signInByExistingIdentity(
    identity: AuthIdentity,
    params: OAuthIdentityContext,
    emailsVerified: OAuthEmail[],
  ): Promise<AuthenticateOAuthServiceResult> {
    const user = await this.userRepository.findById(identity.userId);

    if (!user) {
      throw new OAuthIdentityOwnerNotFoundError();
    }

    // todo:: нужно ли выбрасывать исключение?
    //  Если verified отсутствует:  запросить у пользователя email и подтвердить его собственным кодом.

    // Неподтверждённый локальный аккаунт активируем только по такому же подтверждённому email провайдера.
    if (!user.confirmation.isConfirmed && !this.containsVerifiedEmail(emailsVerified, user.email)) {
      // Для входа в неподтверждённый аккаунт провайдер должен доказать владение системным email.
      throw new OAuthEmailConfirmationRequiredError();
    }

    return this.unitOfWork.run(async (ctx) => {
      const authenticatedUser = user.confirmation.isConfirmed
        ? user
        : await this.userRepository.confirmForOAuth(user.id, ctx);

      if (!authenticatedUser) {
        throw new OAuthIdentityOwnerNotFoundError();
      }

      await this.synchronizeProviderProfile(identity, params, ctx);

      return { status: AuthenticateOAuthStatus.SIGNED_IN, user: authenticatedUser };
    });
  }

  /** Привязывает OAuth identity к уже существующему пользователю с подтверждённым email. */
  private async linkIdentityToExistingUser(
    user: User,
    params: OAuthIdentityContext,
    ctx: TransactionContext,
  ): Promise<AuthenticateOAuthServiceResult> {
    const linkedUser = user.confirmation.isConfirmed
      ? user
      : await this.userRepository.confirmForOAuth(user.id, ctx);

    if (!linkedUser) {
      throw new OAuthIdentityOwnerNotFoundError();
    }

    const identity = await this.identityRepository.createIfAbsent(
      this.toCreateIdentityParams(linkedUser.id, params),
      ctx,
    );

    if (!identity) {
      // Пустой RETURNING означает конфликт одного из уникальных ограничений identity.
      await this.ensureIdentityConflictIsIdempotent(linkedUser.id, params, ctx);
    }

    return { status: AuthenticateOAuthStatus.IDENTITY_LINKED, user: linkedUser };
  }

  /** Создаёт локального пользователя и его первую OAuth identity в одной транзакции. */
  private async registerOAuthUser(
    params: OAuthIdentityContext,
    now: Date,
    ctx: TransactionContext,
  ): Promise<AuthenticateOAuthServiceResult> {
    const code = crypto.randomUUID();
    const expiration = new Date(now);
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    const isVerified = params.verified;
    const createdUser = await this.userRepository.createOAuth(
      {
        email: params.email,
        createdAt: now,
        // Определяем верефецировать ли системного юзера.
        confirmation: isVerified ? ConfirmationInfo.confirmed() : ConfirmationInfo.pending(code, expiration),
      },
      ctx,
    );

    const identity = await this.identityRepository.createIfAbsent(
      this.toCreateIdentityParams(createdUser.id, params),
      ctx,
    );

    if (!identity) {
      // Доменная ошибка откатит создание пользователя вместе со всей транзакцией.
      await this.ensureIdentityConflictIsIdempotent(createdUser.id, params, ctx);
    }

    if (isVerified) {
      return { status: AuthenticateOAuthStatus.REGISTERED, user: createdUser };
    }
    return { status: AuthenticateOAuthStatus.REGISTERED_EMAIL_CONFIRMATION_REQUIRED, user: createdUser };
  }

  /** Обновляет изменяемые данные профиля провайдера, не меняя владельца identity. */
  private async synchronizeProviderProfile(
    identity: AuthIdentity,
    params: OAuthIdentityContext,
    ctx: TransactionContext,
  ): Promise<void> {
    if (!params.email) {
      // Отсутствие primary email в новом ответе не должно стирать ранее сохранённый профиль провайдера.
      return;
    }

    const profileChanged =
      identity.providerEmail !== params.email ||
      identity.providerEmailVerified !== params.verified ||
      identity.username !== params.username ||
      identity.avatarUrl !== params.avatarUrl;
    if (!profileChanged) return;

    await this.identityRepository.updateProviderProfile(
      {
        identityId: identity.id,
        providerEmail: params.email,
        providerEmailVerified: params.verified,
        username: params.username,
        avatarUrl: params.avatarUrl,
      },
      ctx,
    );
  }

  /**
   * Определяет бизнес-причину конфликта после INSERT ... ON CONFLICT DO NOTHING.
   * Точный повтор считается успешным, остальные конфликты преобразуются в доменные ошибки.
   */
  private async ensureIdentityConflictIsIdempotent(
    expectedUserId: number,
    params: OAuthIdentityContext,
    ctx: TransactionContext,
  ): Promise<void> {
    const bySubject = await this.identityRepository.findAuthIdentity(params.subject, params.provider, ctx);

    if (bySubject?.userId === expectedUserId) return;
    if (bySubject) throw new OAuthIdentityLinkedToAnotherUserError();

    const byUserAndProvider = await this.identityRepository.findByUserAndProvider(
      expectedUserId,
      params.provider,
      ctx,
    );

    if (byUserAndProvider) throw new OAuthProviderAlreadyLinkedError();
    throw new UnexpectedOAuthIdentityConflictError();
  }

  /** Собирает единый DTO для создания identity во всех бизнес-сценариях. */
  private toCreateIdentityParams(userId: number, params: OAuthIdentityContext) {
    return {
      userId,
      provider: params.provider,
      providerSubject: params.subject,
      providerEmail: params.email,
      providerEmailVerified: params.verified,
      username: params.username,
      avatarUrl: params.avatarUrl,
    };
  }
  /**
   * Проверяет, что системный email присутствует в списке email-адресов провайдера
   * и подтверждён на его стороне.
   *
   * Используется только для безопасного объединения аккаунтов или повторного входа,
   * если системный email пользователя ещё не подтверждён.
   */
  private containsVerifiedEmail(emails: OAuthEmail[], emailSystem: string): boolean {
    const normalizedSystemEmail = normalizeEmail(emailSystem);
    return emails.some((item) => normalizeEmail(item.email) === normalizedSystemEmail && item.verified);
  }
}
