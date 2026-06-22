import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Environments } from '@app/config';
import { FilesConfig } from './files.config.js';

describe('FilesConfig', () => {
  it('reads, transforms and validates files config', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
      FILES_GRPC_URL: 'localhost:50051',
    });

    expect(new FilesConfig(configService)).toEqual({
      env: Environments.TESTING,
      url: 'localhost:50051',
    });
  });

  it('throws when the GRPC URL is missing', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
    });

    expect(() => new FilesConfig(configService)).toThrow();
  });
});
