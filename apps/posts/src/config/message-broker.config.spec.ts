import 'reflect-metadata';
import { postsMessageBrokerConfig } from './message-broker.config.js';

describe('postsMessageBrokerConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads and validates the broker URL', () => {
    vi.stubEnv('AMQPS_URL', 'amqps://username:password@broker.example.com/vhost');

    expect(postsMessageBrokerConfig()).toEqual({
      url: 'amqps://username:password@broker.example.com/vhost',
    });
  });

  it('throws when AMQPS_URL is invalid', () => {
    vi.stubEnv('AMQPS_URL', 'https://broker.example.com');

    expect(() => postsMessageBrokerConfig()).toThrow('Validation failed');
  });
});
