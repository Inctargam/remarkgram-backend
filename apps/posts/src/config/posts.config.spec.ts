import 'reflect-metadata';
import { Environments } from '@app/config';
import { postsConfig } from './posts.config.js';

describe('postsConfig', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', Environments.TESTING);
    vi.stubEnv('POSTS_GRPC_URL', 'localhost:50053');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates posts config', () => {
    expect(postsConfig()).toEqual({
      env: Environments.TESTING,
      url: 'localhost:50053',
    });
  });

  it('throws when POSTS_GRPC_URL is empty', () => {
    vi.stubEnv('POSTS_GRPC_URL', '');

    expect(() => postsConfig()).toThrow('Validation failed');
  });
});
