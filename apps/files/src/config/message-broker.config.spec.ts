import 'reflect-metadata';
import { filesMessageBrokerConfig } from './message-broker.config.js';

describe('filesMessageBrokerConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads and validates the broker URL', () => {
    vi.stubEnv('AMQPS_URL', 'amqps://username:password@broker.example.com/vhost');

    expect(filesMessageBrokerConfig()).toEqual({
      url: 'amqps://username:password@broker.example.com/vhost',
    });
  });

  it('throws when AMQPS_URL is invalid', () => {
    vi.stubEnv('AMQPS_URL', 'https://broker.example.com');

    expect(() => filesMessageBrokerConfig()).toThrow('Validation failed');
  });
});
