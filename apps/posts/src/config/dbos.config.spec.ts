import 'reflect-metadata';
import {
  POSTS_DBOS_APPLICATION_NAME,
  POSTS_DBOS_APPLICATION_VERSION,
  POSTS_DBOS_EXECUTOR_ID,
  POSTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
  dbosConfig,
} from './dbos.config.js';

describe('dbosConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads the DBOS system database URL and applies singleton settings', () => {
    vi.stubEnv('POSTS_DBOS_SYSTEM_DATABASE_URL', 'postgresql://postgres:password@localhost:5432/posts');

    expect(dbosConfig()).toEqual({
      systemDatabaseUrl: 'postgresql://postgres:password@localhost:5432/posts',
      name: POSTS_DBOS_APPLICATION_NAME,
      applicationVersion: POSTS_DBOS_APPLICATION_VERSION,
      executorId: POSTS_DBOS_EXECUTOR_ID,
      systemDatabasePoolSize: POSTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
      runMigrations: true,
    });
  });

  it('rejects a non-PostgreSQL URL', () => {
    vi.stubEnv('POSTS_DBOS_SYSTEM_DATABASE_URL', 'https://localhost/posts');

    expect(() => dbosConfig()).toThrow('Validation failed');
  });
});
