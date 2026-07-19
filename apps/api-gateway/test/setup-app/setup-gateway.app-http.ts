import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { CanActivate, type INestApplication, ValidationPipe } from '@nestjs/common';
import { ApiGatewayModule } from '../../src/api-gateway.module.ts';
import cookieParser from 'cookie-parser';
import { API_PREFIX } from '../../src/http-api.constants.ts';
import { GithubAuthGuard } from '../../src/modules/user-accounts/presentation/http/guards/github/github-auth.guard.ts';

type SetupGatewayAppHttpReturn = {
  app: INestApplication;
};

export const setupGatewayAppHttp = async (
  //передаем callback, который получает ModuleBuilder, если хотим изменить настройку тестового модуля
  override?: (moduleBuilder: TestingModuleBuilder) => void,
): Promise<SetupGatewayAppHttpReturn> => {
  const testingModule = Test.createTestingModule({
    imports: [ApiGatewayModule],
  });

  if (override) {
    override(testingModule);
  }

  const appModule = await testingModule.compile();
  const app = appModule.createNestApplication();

  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.setGlobalPrefix(API_PREFIX);

  await app.init();

  return {
    app,
  };
};
