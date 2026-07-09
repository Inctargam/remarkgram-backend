import 'reflect-metadata';
import { frontendConfig } from './frontend.config.js';

describe('frontendConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates a frontend URL', () => {
    vi.stubEnv('FRONTEND_URL', 'http://localhost:3000');

    expect(frontendConfig()).toEqual({ baseUrl: 'http://localhost:3000' });
  });

  it('adds an HTTP protocol to a local frontend address', () => {
    vi.stubEnv('FRONTEND_URL', 'localhost:3000');

    expect(frontendConfig()).toEqual({ baseUrl: 'http://localhost:3000' });
  });

  it('uses the production frontend URL when the variable is empty', () => {
    vi.stubEnv('FRONTEND_URL', '');

    expect(frontendConfig()).toEqual({ baseUrl: 'https://remarkgram.com' });
  });

  it('throws when the frontend URL is invalid', () => {
    vi.stubEnv('FRONTEND_URL', '://invalid');

    expect(() => frontendConfig()).toThrow('Validation failed');
  });
});
