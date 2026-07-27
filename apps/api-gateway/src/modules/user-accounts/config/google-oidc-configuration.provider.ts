import type { ConfigType } from '@nestjs/config';
import { discovery, type Configuration } from 'openid-client';
import { GOOGLE_OIDC_ISSUER, googleOidcConfig } from './google-oidc.config.js';

export const GOOGLE_OIDC_CONFIGURATION_LOADER = Symbol('GOOGLE_OIDC_CONFIGURATION_LOADER');

export interface GoogleOidcConfigurationLoader {
  getConfiguration(): Promise<Configuration>;
}

export const googleOidcConfigurationProvider = {
  provide: GOOGLE_OIDC_CONFIGURATION_LOADER,
  inject: [googleOidcConfig.KEY],
  useFactory: (config: ConfigType<typeof googleOidcConfig>): GoogleOidcConfigurationLoader => {
    // Фабрика намеренно синхронная и возвращает loader, а не Promise<Configuration>.
    // Если вернуть Promise непосредственно из useFactory, Nest будет ждать Google discovery
    // во время bootstrap, и временная недоступность Google остановит запуск всего Gateway.
    let configurationPromise: Promise<Configuration> | undefined;

    return {
      getConfiguration: () => {
        // Кешируем сам Promise сразу после запуска discovery. Поэтому параллельные OAuth-запросы
        // получают одну выполняющуюся операцию, а не создают несколько одинаковых HTTP-запросов.
        // После успешного выполнения resolved Promise продолжает служить кешем Configuration.
        configurationPromise ??= discovery(
          new URL(GOOGLE_OIDC_ISSUER),
          config.clientId,
          config.clientSecret,
        ).catch((error: unknown) => {
          // Rejected Promise нельзя оставлять в кеше: иначе все последующие попытки сразу получат
          // прежнюю ошибку. Сброс позволяет следующему OAuth-запросу повторить discovery.
          configurationPromise = undefined;
          throw error;
        });

        // Await выполняет вызывающий controller только в маршрутах Google OAuth.
        return configurationPromise;
      },
    };
  },
};
