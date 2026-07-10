import 'reflect-metadata';
import { Environments } from '@app/config';
import { apiGatewayConfig } from './api-gateway.config.js';

describe('apiGatewayConfig', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', Environments.PRODUCTION);
    vi.stubEnv('GATEWAY_PORT', '3000');
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'https://dev.remark-gram.com, https://dev.remark-gram.com:3000');
    vi.stubEnv('ENABLE_TESTING_ENDPOINTS', 'false');
    vi.stubEnv('TESTING_ENDPOINT_KEY', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('does not require a testing key when destructive endpoints are disabled', () => {
    expect(apiGatewayConfig()).toEqual({
      port: 3000,
      corsAllowedOrigins: ['https://dev.remark-gram.com', 'https://dev.remark-gram.com:3000'],
      env: Environments.PRODUCTION,
      testingEndpointsEnabled: false,
      testingEndpointKey: '',
    });
  });

  it('allows testing endpoints in production with a strong key', () => {
    const key = 'testing-key-with-at-least-32-characters';
    vi.stubEnv('ENABLE_TESTING_ENDPOINTS', 'true');
    vi.stubEnv('TESTING_ENDPOINT_KEY', key);

    expect(apiGatewayConfig()).toEqual({
      port: 3000,
      corsAllowedOrigins: ['https://dev.remark-gram.com', 'https://dev.remark-gram.com:3000'],
      env: Environments.PRODUCTION,
      testingEndpointsEnabled: true,
      testingEndpointKey: key,
    });
  });

  it('rejects an enabled testing endpoint without a strong key', () => {
    vi.stubEnv('ENABLE_TESTING_ENDPOINTS', 'true');
    vi.stubEnv('TESTING_ENDPOINT_KEY', 'short-key');

    expect(() => apiGatewayConfig()).toThrow('Validation failed');
  });

  it('rejects an invalid CORS origin', () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'dev.remark-gram.com');

    expect(() => apiGatewayConfig()).toThrow('Validation failed');
  });

  it('rejects an empty CORS origin caused by an extra comma', () => {
    vi.stubEnv('CORS_ALLOWED_ORIGINS', 'https://dev.remark-gram.com,');

    expect(() => apiGatewayConfig()).toThrow('Validation failed');
  });
});
