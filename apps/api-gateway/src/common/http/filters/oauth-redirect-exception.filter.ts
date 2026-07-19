import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { status } from '@grpc/grpc-js';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';

/** минимальный интерфейс ошибки */
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
  EmailNotConfirmed = 'EMAIL_NOT_CONFIRMED',
  IdentityConflict = 'IDENTITY_CONFLICT',
  AccessDenied = 'ACCESS_DENIED',
  ServiceUnavailable = 'SERVICE_UNAVAILABLE',
}
const OAUTH_REDIRECT_CODE_BY_APP_ERROR: Readonly<Partial<Record<string, OAuthRedirectErrorCode>>> = {
  OAUTH_PROVIDER_EMAIL_REQUIRED: OAuthRedirectErrorCode.EmailRequired,
  OAUTH_PROVIDER_EMAIL_NOT_VERIFIED: OAuthRedirectErrorCode.EmailNotVerified,
  EMAIL_NOT_CONFIRMED: OAuthRedirectErrorCode.EmailNotConfirmed,

  OAUTH_IDENTITY_LINKED_TO_ANOTHER_USER: OAuthRedirectErrorCode.IdentityConflict,

  OAUTH_PROVIDER_ALREADY_LINKED: OAuthRedirectErrorCode.IdentityConflict,

  OAUTH_IDENTITY_CONFLICT: OAuthRedirectErrorCode.IdentityConflict,

  OAUTH_SESSION_CREATION_FAILED: OAuthRedirectErrorCode.ServiceUnavailable,
};

@Catch()
export class OauthRedirectExceptionFilter implements ExceptionFilter {
  catch(_exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const code = this.getRedirectErrorCode(_exception);

    const redirectUrl = new URL('https://remark-gram.com/login');
    redirectUrl.searchParams.set('oauth', 'failed');
    redirectUrl.searchParams.set('code', code);

    response.redirect(302, redirectUrl.toString());
  }
  private getRedirectErrorCode(exception: unknown): OAuthRedirectErrorCode {
    const applicationErrorCode = this.getApplicationErrorCode(exception);

    if (!applicationErrorCode) {
      return OAuthRedirectErrorCode.Unknown;
    }

    return OAUTH_REDIRECT_CODE_BY_APP_ERROR[applicationErrorCode] ?? OAuthRedirectErrorCode.Unknown;
  }
  private getApplicationErrorCode(exception: unknown): string | undefined {
    if (!this.isGrpcServiceError(exception)) {
      return undefined;
    }

    const value = exception.metadata?.get(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY).at(0);

    return value?.toString();
  }

  /**  класс type guard. Type guard имеет специальный возвращаемый тип:  exception is GrpcServiceError */
  private isGrpcServiceError(exception: unknown): exception is GrpcServiceError {
    if (typeof exception !== 'object' || exception === null) {
      return false;
    }

    if (!('code' in exception)) {
      return false;
    }

    const grpcStatus = exception.code;

    return typeof grpcStatus === 'number' && Number.isInteger(grpcStatus) && status[grpcStatus] !== undefined;
  }
}
