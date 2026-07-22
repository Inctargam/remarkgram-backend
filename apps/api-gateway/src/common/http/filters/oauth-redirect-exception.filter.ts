import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Inject, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { status } from '@grpc/grpc-js';
import type { Response } from 'express';
import { AuthorizationResponseError } from 'openid-client';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { frontendConfig } from '../../../config/frontend.config.js';

type GrpcServiceError = {
  code: status;
  metadata?: {
    get(key: string): unknown[];
  };
};

export enum OAuthRedirectErrorCode {
  Unknown = 'UNKNOWN_ERROR',
  EmailRequired = 'EMAIL_REQUIRED',
  EmailNotVerified = 'EMAIL_NOT_VERIFIED',
  EmailConfirmationRequired = 'EMAIL_CONFIRMATION_REQUIRED',
  IdentityOwnerNotFound = 'IDENTITY_OWNER_NOT_FOUND',
  IdentityLinkedToAnotherUser = 'IDENTITY_LINKED_TO_ANOTHER_USER',
  ProviderAlreadyLinked = 'PROVIDER_ALREADY_LINKED',
  IdentityConflict = 'IDENTITY_CONFLICT',
  AccessDenied = 'ACCESS_DENIED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}

const OAUTH_REDIRECT_CODE_BY_APP_ERROR: Readonly<Partial<Record<string, OAuthRedirectErrorCode>>> = {
  OAUTH_EMAIL_REQUIRED: OAuthRedirectErrorCode.EmailRequired,
  OAUTH_EMAIL_NOT_VERIFIED: OAuthRedirectErrorCode.EmailNotVerified,
  OAUTH_EMAIL_CONFIRMATION_REQUIRED: OAuthRedirectErrorCode.EmailConfirmationRequired,
  OAUTH_IDENTITY_OWNER_NOT_FOUND: OAuthRedirectErrorCode.IdentityOwnerNotFound,
  OAUTH_IDENTITY_LINKED_TO_ANOTHER_USER: OAuthRedirectErrorCode.IdentityLinkedToAnotherUser,
  OAUTH_PROVIDER_ALREADY_LINKED: OAuthRedirectErrorCode.ProviderAlreadyLinked,
  OAUTH_IDENTITY_CONFLICT: OAuthRedirectErrorCode.IdentityConflict,
  OAUTH_SESSION_CREATION_FAILED: OAuthRedirectErrorCode.ServiceUnavailable,
};

@Catch()
export class OauthRedirectExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(OauthRedirectExceptionFilter.name);

  constructor(@Inject(frontendConfig.KEY) private readonly frontend: ConfigType<typeof frontendConfig>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const code = this.getRedirectErrorCode(exception);

    if (code === OAuthRedirectErrorCode.Unknown) {
      // Неизвестная ошибка скрывается от браузера, но сохраняется в серверных логах для диагностики.
      this.logger.error('Unknown OAuth callback error', exception);
    }

    const redirectUrl = new URL('/login', this.frontend.baseUrl);
    redirectUrl.searchParams.set('oauth', 'failed');
    redirectUrl.searchParams.set('code', code);

    response.redirect(302, redirectUrl.toString());
  }

  private getRedirectErrorCode(exception: unknown): OAuthRedirectErrorCode {
    if (exception instanceof HttpException && exception.getStatus() === 401) {
      return OAuthRedirectErrorCode.AccessDenied;
    }

    if (exception instanceof AuthorizationResponseError) {
      if (exception.error === 'access_denied') return OAuthRedirectErrorCode.AccessDenied;

      if (exception.error === 'server_error' || exception.error === 'temporarily_unavailable') {
        return OAuthRedirectErrorCode.ServiceUnavailable;
      }
    }

    const applicationErrorCode = this.getApplicationErrorCode(exception);
    return applicationErrorCode
      ? (OAUTH_REDIRECT_CODE_BY_APP_ERROR[applicationErrorCode] ?? OAuthRedirectErrorCode.Unknown)
      : OAuthRedirectErrorCode.Unknown;
  }

  private getApplicationErrorCode(exception: unknown): string | undefined {
    if (!this.isGrpcServiceError(exception)) return undefined;

    return exception.metadata?.get(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY).at(0)?.toString();
  }

  private isGrpcServiceError(exception: unknown): exception is GrpcServiceError {
    if (typeof exception !== 'object' || exception === null || !('code' in exception)) return false;

    const grpcStatus = exception.code;
    return typeof grpcStatus === 'number' && Number.isInteger(grpcStatus) && status[grpcStatus] !== undefined;
  }
}
