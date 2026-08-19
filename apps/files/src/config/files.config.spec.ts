import 'reflect-metadata';
import { Environments } from '@app/config';
import { filesConfig } from './files.config.js';

describe('filesConfig', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', Environments.TESTING);
    vi.stubEnv('FILES_GRPC_URL', 'localhost:50051');
    vi.stubEnv('FILES_S3_ENDPOINT', 'https://storage.yandexcloud.net');
    vi.stubEnv('FILES_S3_REGION', 'ru-central1');
    vi.stubEnv('FILES_S3_BUCKET', 'remarkgram-files');
    vi.stubEnv('FILES_S3_ACCESS_KEY_ID', 'access-key-id');
    vi.stubEnv('FILES_S3_SECRET_ACCESS_KEY', 'secret-access-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reads and validates files config', () => {
    expect(filesConfig()).toEqual({
      url: 'localhost:50051',
      env: Environments.TESTING,
      s3: {
        endpoint: 'https://storage.yandexcloud.net',
        region: 'ru-central1',
        bucket: 'remarkgram-files',
        accessKeyId: 'access-key-id',
        secretAccessKey: 'secret-access-key',
      },
    });
  });

  it.each([
    'FILES_GRPC_URL',
    'FILES_S3_ENDPOINT',
    'FILES_S3_REGION',
    'FILES_S3_BUCKET',
    'FILES_S3_ACCESS_KEY_ID',
    'FILES_S3_SECRET_ACCESS_KEY',
  ])('throws when %s is empty', (variableName) => {
    vi.stubEnv(variableName, '');

    expect(() => filesConfig()).toThrow('Validation failed');
  });

  it('throws when FILES_S3_ENDPOINT is not a URL', () => {
    vi.stubEnv('FILES_S3_ENDPOINT', 'storage.yandexcloud.net');

    expect(() => filesConfig()).toThrow('Validation failed');
  });
  it('throws when NODE_ENV is invalid', () => {
    vi.stubEnv('NODE_ENV', 'invalid');

    expect(() => filesConfig()).toThrow('Validation failed');
  });
});
