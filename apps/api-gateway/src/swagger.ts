import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
  .addTag('Auth', 'Registration, authentication and password reset.')
  .addTag('Sessions', 'Active session management.')
  .addTag('Users', 'User queries.')
  .addTag('Files', 'File operations.')
  .build();

export const createSwaggerDocument = (app: INestApplication) =>
  SwaggerModule.createDocument(app, swaggerConfig, {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  });

export const setupSwagger = (app: INestApplication): void => {
  SwaggerModule.setup('api/docs', app, () => createSwaggerDocument(app), {
    customSiteTitle: 'Remarkgram API',
    swaggerOptions: { persistAuthorization: true },
  });
};
