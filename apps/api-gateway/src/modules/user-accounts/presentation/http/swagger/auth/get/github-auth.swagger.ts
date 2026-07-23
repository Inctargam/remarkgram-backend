import { applyDecorators } from '@nestjs/common';
import { ApiFoundResponse, ApiOperation } from '@nestjs/swagger';

export const ApiGithubAuth = () =>
  applyDecorators(
    ApiOperation({
      summary: 'Start GitHub OAuth authentication',
      description:
        'Starts the GitHub OAuth authorization flow. This endpoint is intended for browser navigation, not an AJAX request. The response redirects the browser to GitHub, where the user grants access to the application.',
    }),
    ApiFoundResponse({
      description: 'The browser is redirected to the GitHub authorization page.',
      headers: {
        Location: {
          description: 'GitHub OAuth authorization URL.',
          schema: {
            type: 'string',
            format: 'uri',
            example: 'https://github.com/login/oauth/authorize?client_id=...&scope=read%3Auser+user%3Aemail',
          },
        },
      },
    }),
  );
