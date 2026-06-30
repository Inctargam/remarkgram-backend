import 'reflect-metadata';
import { databaseConfig } from './database.config.js';

describe('databaseConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates database config', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/user_accounts');

    expect(databaseConfig()).toEqual({
      url: 'postgresql://postgres:password@localhost:5432/user_accounts',
    });
  });

  it('throws when DATABASE_URL is not a PostgreSQL URL', () => {
    vi.stubEnv('DATABASE_URL', 'https://localhost/user_accounts');

    expect(() => databaseConfig()).toThrow('Validation failed');
  });
});
