import 'reflect-metadata';
import { databaseConfig } from './database.config.js';

describe('databaseConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates the posts database URL', () => {
    vi.stubEnv('POSTS_DATABASE_URL', 'postgresql://postgres:password@localhost:5432/posts');

    expect(databaseConfig()).toEqual({
      url: 'postgresql://postgres:password@localhost:5432/posts',
    });
  });

  it('throws when POSTS_DATABASE_URL is not a PostgreSQL URL', () => {
    vi.stubEnv('POSTS_DATABASE_URL', 'https://localhost/posts');

    expect(() => databaseConfig()).toThrow('Validation failed');
  });
});
