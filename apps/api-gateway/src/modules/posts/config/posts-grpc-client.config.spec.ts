import 'reflect-metadata';
import { postsGrpcClientConfig } from './posts-grpc-client.config.js';

describe('postsGrpcClientConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates the posts gRPC URL', () => {
    vi.stubEnv('POSTS_GRPC_URL', 'localhost:50053');

    expect(postsGrpcClientConfig()).toEqual({ url: 'localhost:50053' });
  });

  it('throws when POSTS_GRPC_URL is empty', () => {
    vi.stubEnv('POSTS_GRPC_URL', '');

    expect(() => postsGrpcClientConfig()).toThrow('Validation failed');
  });
});
