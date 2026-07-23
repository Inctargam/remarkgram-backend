import type { ConfigType } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { OAuthProvider } from '@app/user-accounts-grpc';
import type { CookieOptions, Request, Response } from 'express';
import { calculatePKCECodeChallenge, Configuration } from 'openid-client';
import type * as OpenIdClient from 'openid-client';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { frontendConfig } from '../../../../../config/frontend.config.js';
import type { RecaptchaVerifiersService } from '../../captcha/recaptcha-verifiers.service.js';
import type { googleOidcConfig } from '../../../config/google-oidc.config.js';
import type { userAccountsHttpConfig } from '../../../config/user-accounts-http.config.js';
import { AuthHttpController } from './auth-http.controller.js';

type AuthorizationCodeGrantMock = (
  configuration: Configuration,
  currentUrl: URL,
  checks: {
    expectedState: string;
    expectedNonce: string;
    pkceCodeVerifier: string;
  },
) => Promise<{ claims(): unknown }>;

const { authorizationCodeGrantMock } = vi.hoisted(() => ({
  authorizationCodeGrantMock: vi.fn<AuthorizationCodeGrantMock>(),
}));

vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof OpenIdClient>()),
  authorizationCodeGrant: authorizationCodeGrantMock,
}));

describe(AuthHttpController.name, () => {
  beforeEach(() => {
    authorizationCodeGrantMock.mockReset();
  });

  it('starts Google authentication with browser-bound state, nonce and PKCE', async () => {
    const callbackUrl = 'http://localhost:3000/api/v1/auth/google/callback';
    const oidc = new Configuration(
      {
        issuer: 'https://accounts.google.com',
        authorization_endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        token_endpoint: 'https://oauth2.googleapis.com/token',
        jwks_uri: 'https://www.googleapis.com/oauth2/v3/certs',
      },
      'google-client-id',
      'google-client-secret',
    );
    const controller = new AuthHttpController(
      {} as ClientGrpc,
      {} as ConfigType<typeof userAccountsHttpConfig>,
      {} as ConfigType<typeof frontendConfig>,
      { callbackUrl } as ConfigType<typeof googleOidcConfig>,
      oidc,
      {} as RecaptchaVerifiersService,
    );
    const cookie = vi.fn<(name: string, value: string, options: CookieOptions) => void>();
    const redirect = vi.fn<(statusCode: number, url: string) => void>();
    const response = { cookie, redirect } as unknown as Response;

    await controller.googleAuth(response);

    const cookies = new Map(cookie.mock.calls.map(([name, value]) => [name, value]));
    const state = cookies.get('googleOidcState');
    const nonce = cookies.get('googleOidcNonce');
    const codeVerifier = cookies.get('googleOidcCodeVerifier');
    const redirectUrl = redirect.mock.calls[0]?.[1];

    if (!state || !nonce || !codeVerifier || !redirectUrl) {
      throw new Error('Google OIDC transaction values were not created');
    }

    const authorizationUrl = new URL(redirectUrl);

    expect(cookie).toHaveBeenCalledTimes(3);
    expect(cookie).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        path: '/api/v1/auth/google/callback',
        maxAge: 5 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      }),
    );
    expect(redirect).toHaveBeenCalledWith(302, expect.any(String));
    expect(authorizationUrl.origin + authorizationUrl.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    expect(authorizationUrl.searchParams.get('client_id')).toBe('google-client-id');
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBe(callbackUrl);
    expect(authorizationUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizationUrl.searchParams.get('scope')).toBe('openid email profile');
    expect(authorizationUrl.searchParams.get('state')).toBe(state);
    expect(authorizationUrl.searchParams.get('nonce')).toBe(nonce);
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorizationUrl.searchParams.get('code_challenge')).toBe(
      await calculatePKCECodeChallenge(codeVerifier),
    );
  });

  it('completes Google authentication using the browser transaction', async () => {
    const callbackUrl = 'https://api.example.com/api/v1/auth/google/callback';
    const authenticateOAuth = vi.fn().mockReturnValue(
      of({
        accessToken: 'application-access-token',
        refreshToken: 'application-refresh-token',
      }),
    );
    const grpcClient = {
      getService: vi.fn().mockReturnValue({ authenticateOAuth }),
    } as unknown as ClientGrpc;
    const controller = new AuthHttpController(
      grpcClient,
      { refreshTokenCookieMaxAgeMs: 60_000 } as ConfigType<typeof userAccountsHttpConfig>,
      { baseUrl: 'https://frontend.example.com' },
      { callbackUrl } as ConfigType<typeof googleOidcConfig>,
      {} as Configuration,
      {} as RecaptchaVerifiersService,
    );
    controller.onModuleInit();
    authorizationCodeGrantMock.mockResolvedValue({
      claims: () => ({
        sub: 'google-subject',
        email: 'user@example.com',
        email_verified: true,
        name: 'User',
        picture: 'https://example.com/avatar.png',
      }),
    });
    const request = {
      originalUrl: '/api/v1/auth/google/callback?code=google-code&state=stored-state',
      cookies: {
        googleOidcState: 'stored-state',
        googleOidcNonce: 'stored-nonce',
        googleOidcCodeVerifier: 'stored-code-verifier',
      },
    } as Request;
    const cookie = vi.fn();
    const clearCookie = vi.fn();
    const redirect = vi.fn();
    const response = { cookie, clearCookie, redirect } as unknown as Response;

    await controller.googleAuthCallback(request, response, 'test-browser', '127.0.0.1');

    const [, currentUrl, checks] = authorizationCodeGrantMock.mock.calls[0];
    expect(currentUrl).toEqual(new URL(`${callbackUrl}?code=google-code&state=stored-state`));
    expect(checks).toEqual({
      expectedState: 'stored-state',
      expectedNonce: 'stored-nonce',
      pkceCodeVerifier: 'stored-code-verifier',
    });
    expect(clearCookie).toHaveBeenCalledTimes(3);
    expect(clearCookie).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        path: '/api/v1/auth/google/callback',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
      }),
    );
    expect(authenticateOAuth).toHaveBeenCalledWith({
      identity: {
        provider: OAuthProvider.OAUTH_PROVIDER_GOOGLE,
        subject: 'google-subject',
        emails: [{ email: 'user@example.com', verified: true, primary: true }],
        username: 'User',
        avatarUrl: 'https://example.com/avatar.png',
      },
      ip: '127.0.0.1',
      deviceName: 'test-browser',
    });
    expect(cookie).toHaveBeenCalledWith('refreshToken', 'application-refresh-token', expect.any(Object));
    expect(redirect).toHaveBeenCalledWith(302, 'https://frontend.example.com/');
  });

  it('clears the Google transaction cookies when code exchange fails', async () => {
    const callbackUrl = 'https://api.example.com/api/v1/auth/google/callback';
    const controller = new AuthHttpController(
      {} as ClientGrpc,
      {} as ConfigType<typeof userAccountsHttpConfig>,
      {} as ConfigType<typeof frontendConfig>,
      { callbackUrl } as ConfigType<typeof googleOidcConfig>,
      {} as Configuration,
      {} as RecaptchaVerifiersService,
    );
    authorizationCodeGrantMock.mockRejectedValue(new Error('invalid authorization response'));
    const request = {
      originalUrl: '/api/v1/auth/google/callback?code=invalid-code&state=stored-state',
      cookies: {
        googleOidcState: 'stored-state',
        googleOidcNonce: 'stored-nonce',
        googleOidcCodeVerifier: 'stored-code-verifier',
      },
    } as Request;
    const clearCookie = vi.fn();
    const response = { clearCookie } as unknown as Response;

    await expect(controller.googleAuthCallback(request, response, undefined, '127.0.0.1')).rejects.toThrow(
      'invalid authorization response',
    );

    expect(clearCookie).toHaveBeenCalledTimes(3);
  });
});
