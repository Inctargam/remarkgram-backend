import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Environments } from '../../../../libs/config/index.js';
import { PostsConfig } from './posts.config.js';

describe('PostsConfig', () => {
  it('reads, transforms and validates files config', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
      POSTS_PORT: '3003',
      POSTS_DATABASE_URL: 'postgresql://postgres:123456@localhost:5432/posts',
    });

    expect(new PostsConfig(configService)).toEqual({
      env: Environments.TESTING,
      port: 3003,
      databaseUrl: 'postgresql://postgres:123456@localhost:5432/posts',
    });
  });

  it('throws when the TCP port is invalid', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
      POSTS_PORT: '127.0.0.1',
      POSTS_DATABASE_URL: 'invalid',
    });
    expect(() => new PostsConfig(configService)).toThrow();
  });
});
