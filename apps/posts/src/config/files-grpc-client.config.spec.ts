import 'reflect-metadata';
import { filesGrpcClientConfig } from './files-grpc-client.config.js';

describe('filesGrpcClientConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates the files gRPC URL', () => {
    vi.stubEnv('FILES_GRPC_URL', 'localhost:50051');

    expect(filesGrpcClientConfig()).toEqual({ url: 'localhost:50051' });
  });

  it('throws when FILES_GRPC_URL is empty', () => {
    vi.stubEnv('FILES_GRPC_URL', '');

    expect(() => filesGrpcClientConfig()).toThrow('Validation failed');
  });
});
