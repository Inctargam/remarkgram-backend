import { applyDecorators } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation, ApiQuery } from '@nestjs/swagger';

export const ApiGithubAuthCallback = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Complete GitHub OAuth authentication',
      description: [
        'Callback invoked by GitHub after authorization. It is intended for browser navigation and always redirects to the frontend.',
        '',
        'On success, the gateway stores the refresh token in a secure httpOnly cookie and redirects to the frontend.',
        'If user action is required or authentication fails, the gateway redirects to the frontend login flow with a public OAuth error code.',
        'Tokens, the GitHub subject and internal exception messages are never included in the redirect URL.',
      ].join('\n'),
    }),
    ApiQuery({
      name: 'code',
      required: false,
      type: String,
      description: 'Temporary authorization code returned by GitHub.',
    }),
    ApiQuery({
      name: 'error',
      required: false,
      type: String,
      description: 'OAuth error returned by GitHub when authorization was not completed.',
      example: 'access_denied',
    }),
    ApiQuery({
      name: 'error_description',
      required: false,
      type: String,
      description: 'Optional diagnostic description returned by GitHub.',
    }),
    ApiFoundResponse({
      description: [
        'OAuth processing finished and the browser is redirected to the frontend.',
        '',
        'Success: the response includes the refreshToken cookie.',
        'Public error codes: EMAIL_REQUIRED, EMAIL_NOT_VERIFIED, EMAIL_CONFIRMATION_REQUIRED, IDENTITY_OWNER_NOT_FOUND, IDENTITY_LINKED_TO_ANOTHER_USER, PROVIDER_ALREADY_LINKED, IDENTITY_CONFLICT, ACCESS_DENIED, SERVICE_UNAVAILABLE or UNKNOWN_ERROR.',
      ].join('\n'),
      headers: {
        Location: {
          description: 'Frontend URL representing the OAuth result.',
          schema: {
            type: 'string',
            format: 'uri',
            examples: [
              'https://remark-gram.com',
              'https://remark-gram.com/login?oauth=failed&code=EMAIL_CONFIRMATION_REQUIRED',
            ],
          },
        },
        'Set-Cookie': {
          description:
            'Present only after successful authentication. Stores refreshToken with HttpOnly, Secure and SameSite=Strict attributes.',
          schema: {
            type: 'string',
            example: 'refreshToken=...; Path=/; HttpOnly; Secure; SameSite=Strict',
          },
        },
      },
    }),
  );
