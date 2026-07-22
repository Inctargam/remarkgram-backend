import { applyDecorators } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation } from '@nestjs/swagger';

export const ApiGoogleAuth = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Start Google OIDC authentication',
      description: [
        'Starts the Google OpenID Connect authorization-code flow. This endpoint is intended for browser navigation, not an AJAX request.',
        '',
        'The gateway creates short-lived, HttpOnly transaction cookies for state, nonce and the PKCE verifier, then redirects the browser to Google.',
      ].join('\n'),
    }),
    ApiFoundResponse({
      description: 'The browser is redirected to Google and receives the temporary OIDC transaction cookies.',
      headers: {
        Location: {
          description: 'Google authorization URL containing state, nonce and the S256 PKCE challenge.',
          schema: {
            type: 'string',
            format: 'uri',
            example:
              'https://accounts.google.com/o/oauth2/v2/auth?client_id=...&response_type=code&scope=openid%20email%20profile&state=...&nonce=...&code_challenge=...&code_challenge_method=S256',
          },
        },
        'Set-Cookie': {
          description:
            'Three short-lived HttpOnly cookies containing the OIDC state, nonce and PKCE verifier. Secure is enabled for an HTTPS callback.',
          schema: {
            type: 'string',
            example:
              'googleOidcState=...; Path=/api/v1/auth/google/callback; Max-Age=300; HttpOnly; Secure; SameSite=Lax',
          },
        },
      },
    }),
  );
