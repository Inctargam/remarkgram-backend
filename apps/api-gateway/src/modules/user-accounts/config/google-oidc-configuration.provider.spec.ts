import type { ConfigType } from '@nestjs/config';
import type { Configuration } from 'openid-client';
import type * as OpenIdClient from 'openid-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  googleOidcConfigurationProvider,
  type GoogleOidcConfigurationLoader,
} from './google-oidc-configuration.provider.js';
import type { googleOidcConfig } from './google-oidc.config.js';

const { discoveryMock } = vi.hoisted(() => ({
  discoveryMock: vi.fn<typeof OpenIdClient.discovery>(),
}));

vi.mock('openid-client', async (importOriginal) => ({
  ...(await importOriginal<typeof OpenIdClient>()),
  discovery: discoveryMock,
}));

describe('googleOidcConfigurationProvider', () => {
  const config = {
    clientId: 'google-client-id',
    clientSecret: 'google-client-secret',
  } as ConfigType<typeof googleOidcConfig>;

  const createLoader = (): GoogleOidcConfigurationLoader =>
    googleOidcConfigurationProvider.useFactory(config);

  beforeEach(() => {
    discoveryMock.mockReset();
  });

  it('does not run discovery while the application is starting', () => {
    createLoader();

    expect(discoveryMock).not.toHaveBeenCalled();
  });

  it('loads and caches the discovered configuration on demand', async () => {
    const configuration = {} as Configuration;
    discoveryMock.mockResolvedValue(configuration);
    const loader = createLoader();

    const firstLoad = loader.getConfiguration();
    const secondLoad = loader.getConfiguration();

    await expect(firstLoad).resolves.toBe(configuration);
    await expect(secondLoad).resolves.toBe(configuration);
    expect(discoveryMock).toHaveBeenCalledTimes(1);
  });

  it('retries discovery after a failed request', async () => {
    const configuration = {} as Configuration;
    discoveryMock.mockRejectedValueOnce(new Error('Google discovery is unavailable'));
    discoveryMock.mockResolvedValueOnce(configuration);
    const loader = createLoader();

    await expect(loader.getConfiguration()).rejects.toThrow('Google discovery is unavailable');
    await expect(loader.getConfiguration()).resolves.toBe(configuration);
    expect(discoveryMock).toHaveBeenCalledTimes(2);
  });
});
