import type { ConfigType } from '@nestjs/config';
import { discovery } from 'openid-client';
import { GOOGLE_OIDC_ISSUER, googleOidcConfig } from './google-oidc.config.js';

export const GOOGLE_OIDC_DISCOVERED_CONFIGURATION = Symbol('GOOGLE_OIDC_DISCOVERED_CONFIGURATION');

// Eager discovery: Nest создаёт этот провайдер во время запуска, поэтому API Gateway не запустится,
// если discovery endpoint Google недоступен. Чтобы сбой затрагивал только аутентификацию через Google,
// можно использовать ленивую загрузку: кешировать Promise discovery и сбрасывать его после ошибки для retry.
export const googleOidcConfigurationProvider = {
  provide: GOOGLE_OIDC_DISCOVERED_CONFIGURATION,
  inject: [googleOidcConfig.KEY],
  useFactory: (config: ConfigType<typeof googleOidcConfig>) =>
    discovery(new URL(GOOGLE_OIDC_ISSUER), config.clientId, config.clientSecret),
};
