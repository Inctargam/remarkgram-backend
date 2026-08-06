import { applyDecorators } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

export const ApiGoogleAuthCallback = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Complete Google OIDC authentication',
      description: [
        'Callback invoked by Google after authorization. It is intended for browser navigation and always redirects to the frontend.',
        '',
        'The gateway validates state, nonce and PKCE, clears the one-time transaction cookies and creates an application session.',
        'On success, the refresh token is stored in a secure HttpOnly cookie. On failure, the frontend receives only a public OAuth error code.',
      ].join('\n'),
    }),
    ApiQuery({
      name: 'code',
      required: false,
      type: String,
      description: 'Temporary authorization code returned by Google after successful authorization.',
    }),
    ApiQuery({
      name: 'state',
      required: false,
      type: String,
      description: 'OIDC state returned by Google and compared with the browser transaction cookie.',
    }),
    ApiQuery({
      name: 'error',
      required: false,
      type: String,
      description: 'OAuth error returned by Google when authorization was not completed.',
      example: 'access_denied',
    }),
    ApiQuery({
      name: 'error_description',
      required: false,
      type: String,
      description: 'Optional diagnostic description returned by Google.',
    }),
    ApiFoundResponse({
      description: [
        'OIDC processing finished and the browser is redirected to the frontend.',
        '',
        'Success: the response clears the transaction cookies and sets the refreshToken cookie.',
        'Public error codes: EMAIL_REQUIRED, EMAIL_NOT_VERIFIED, EMAIL_CONFIRMATION_REQUIRED, IDENTITY_OWNER_NOT_FOUND, IDENTITY_LINKED_TO_ANOTHER_USER, PROVIDER_ALREADY_LINKED, IDENTITY_CONFLICT, ACCESS_DENIED, SERVICE_UNAVAILABLE or UNKNOWN_ERROR.',
      ].join('\n'),
      headers: {
        Location: {
          description: 'Frontend URL representing the OAuth result.',
          schema: {
            type: 'string',
            format: 'uri',
            examples: [
              'https://remark-gram.com/',
              'https://remark-gram.com/login?oauth=failed&code=ACCESS_DENIED',
            ],
          },
        },
        'Set-Cookie': {
          description:
            'Always expires the state, nonce and PKCE cookies. After successful authentication it also stores refreshToken with HttpOnly, Secure and SameSite=Strict attributes.',
          schema: {
            type: 'string',
            example: 'refreshToken=...; Path=/; HttpOnly; Secure; SameSite=Strict',
          },
        },
      },
    }),
  );
