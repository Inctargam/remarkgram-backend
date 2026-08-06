import 'reflect-metadata';
import { databaseConfig } from './database.config.js';

describe('databaseConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates database config', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/files');

    expect(databaseConfig()).toEqual({
      url: 'postgresql://postgres:password@localhost:5432/files',
    });
  });

  it('throws when DATABASE_URL is not a PostgreSQL URL', () => {
    vi.stubEnv('DATABASE_URL', 'https://localhost/files');

    expect(() => databaseConfig()).toThrow('Validation failed');
  });
});
