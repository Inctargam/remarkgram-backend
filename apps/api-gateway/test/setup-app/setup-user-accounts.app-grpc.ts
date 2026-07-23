import { Test, TestingModule } from '@nestjs/testing';
import type { INestMicroservice } from '@nestjs/common';
import { type MicroserviceOptions, Transport } from '@nestjs/microservices';
import {
  REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
  USER_ACCOUNTS_GRPC_PROTO_PATH,
} from '@app/user-accounts-grpc';
import { UserAccountsModule } from '../../../user-accounts/src/app.module.js';

type SetupReturn = {
  app: INestMicroservice;
};

export const setupUserAccountsAppGrpc = async (
  //передаем callback, который получает ModuleBuilder, если хотим изменить настройку тестового модуля
  override?: (moduleBuilder: TestingModule) => void,
): Promise<SetupReturn> => {
  const testingModule = await Test.createTestingModule({
    imports: [UserAccountsModule],
  }).compile();

  if (override) {
    override(testingModule);
  }
  // Затем создай gRPC-микросервис:
  const app = testingModule.createNestMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: REMARKGRAM_USER_ACCOUNTS_V1_PACKAGE_NAME,
      protoPath: USER_ACCOUNTS_GRPC_PROTO_PATH,
      url: 'localhost:50052',
    },
  });

  // И запусти его:

  await app.listen();

  return {
    app,
  };
};
