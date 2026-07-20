import type { ArgumentsHost } from '@nestjs/common';
import { Metadata, status } from '@grpc/grpc-js';
import type { Response } from 'express';
import { USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY } from '@app/user-accounts-grpc';
import { OauthRedirectExceptionFilter } from './oauth-redirect-exception.filter.js';

function createHost(response: Partial<Response>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: vi.fn(),
      getNext: vi.fn(),
    }),
  } as unknown as ArgumentsHost;
}

describe('OauthRedirectExceptionFilter', () => {
  it.each([
    ['OAUTH_EMAIL_REQUIRED', 'EMAIL_REQUIRED'],
    ['OAUTH_EMAIL_NOT_VERIFIED', 'EMAIL_NOT_VERIFIED'],
    ['OAUTH_EMAIL_CONFIRMATION_REQUIRED', 'EMAIL_CONFIRMATION_REQUIRED'],
    ['OAUTH_IDENTITY_OWNER_NOT_FOUND', 'IDENTITY_OWNER_NOT_FOUND'],
    ['OAUTH_IDENTITY_LINKED_TO_ANOTHER_USER', 'IDENTITY_LINKED_TO_ANOTHER_USER'],
    ['OAUTH_PROVIDER_ALREADY_LINKED', 'PROVIDER_ALREADY_LINKED'],
    ['OAUTH_IDENTITY_CONFLICT', 'IDENTITY_CONFLICT'],
    ['OAUTH_SESSION_CREATION_FAILED', 'SERVICE_UNAVAILABLE'],
  ])('maps %s to the public redirect code %s', (applicationCode, redirectCode) => {
    const metadata = new Metadata();
    metadata.set(USER_ACCOUNTS_APP_ERROR_CODE_METADATA_KEY, applicationCode);
    const response = { redirect: vi.fn() };
    const filter = new OauthRedirectExceptionFilter({ baseUrl: 'https://frontend.example.com' });

    filter.catch({ code: status.FAILED_PRECONDITION, metadata }, createHost(response));

    expect(response.redirect).toHaveBeenCalledWith(
      302,
      `https://frontend.example.com/login?oauth=failed&code=${redirectCode}`,
    );
  });
});
