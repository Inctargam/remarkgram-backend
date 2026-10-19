import 'reflect-metadata';
import {
  PAYMENTS_DBOS_APPLICATION_NAME,
  PAYMENTS_DBOS_APPLICATION_VERSION,
  PAYMENTS_DBOS_EXECUTOR_ID,
  PAYMENTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
  dbosConfig,
} from './dbos.config.js';

describe('dbosConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads the Payments DBOS system database URL', () => {
    vi.stubEnv('PAYMENTS_DBOS_SYSTEM_DATABASE_URL', 'postgresql://postgres:password@localhost/payments');

    expect(dbosConfig()).toEqual({
      systemDatabaseUrl: 'postgresql://postgres:password@localhost/payments',
      name: PAYMENTS_DBOS_APPLICATION_NAME,
      applicationVersion: PAYMENTS_DBOS_APPLICATION_VERSION,
      executorId: PAYMENTS_DBOS_EXECUTOR_ID,
      systemDatabasePoolSize: PAYMENTS_DBOS_SYSTEM_DATABASE_POOL_SIZE,
      runMigrations: true,
    });
  });

  it('rejects a non-PostgreSQL URL', () => {
    vi.stubEnv('PAYMENTS_DBOS_SYSTEM_DATABASE_URL', 'https://localhost/payments');
    expect(() => dbosConfig()).toThrow('Validation failed');
  });
});
