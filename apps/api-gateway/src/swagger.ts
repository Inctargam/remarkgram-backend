import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SWAGGER_PATH } from './http-api.constants.js';

const swaggerConfig = new DocumentBuilder()
  .setTitle('Remarkgram API')
  .setDescription('HTTP API exposed by the Remarkgram API Gateway.')
  .setVersion('1.0')
  .addCookieAuth(
    'refreshToken',
    {
      type: 'apiKey',
      in: 'cookie',
      description: 'HttpOnly refresh-token cookie set by login or refresh-token.',
    },
    'refreshToken',
  )
  .addBearerAuth(
    {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'Access token returned by login or refresh-token.',
    },
    'accessToken',
  )
  .addApiKey(
    {
      type: 'apiKey',
      in: 'header',
      name: 'X-Testing-Key',
      description: 'Secret key protecting destructive testing endpoints.',
    },
    'testingKey',
  )
  .addTag('Auth', 'Registration, authentication and password reset.')
  .addTag('Sessions', 'Active session management.')
  .addTag('Testing', 'Development and test utilities.')
  .build();

export const createSwaggerDocument = (app: INestApplication) =>
  SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });

export const setupSwagger = (app: INestApplication): void => {
  SwaggerModule.setup(SWAGGER_PATH, app, () => createSwaggerDocument(app), {
    customSiteTitle: 'Remarkgram API',
    swaggerOptions: { persistAuthorization: true },
  });
};
