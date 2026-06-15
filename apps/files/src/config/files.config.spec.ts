import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { Environments } from '../../../../libs/config/index.js';
import { FilesConfig } from './files.config.js';

describe('FilesConfig', () => {
  it('reads, transforms and validates files config', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
      FILES_TCP_HOST: '127.0.0.1',
      FILES_TCP_PORT: '3003',
    });

    expect(new FilesConfig(configService)).toEqual({
      env: Environments.TESTING,
      tcpHost: '127.0.0.1',
      tcpPort: 3003,
    });
  });

  it('throws when the TCP port is invalid', () => {
    const configService = new ConfigService({
      NODE_ENV: Environments.TESTING,
      FILES_TCP_HOST: '127.0.0.1',
      FILES_TCP_PORT: 'invalid',
    });

    expect(() => new FilesConfig(configService)).toThrow();
  });
});
