import { PAYMENTS_GRPC_PROTO_PATH, REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME } from '@app/payments-grpc';
import { Module } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { paymentsGrpcClientConfig } from './config/payments-grpc-client.config.js';
import { PaymentsHttpController } from './presentation/http/payments-http.controller.js';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME,
        inject: [paymentsGrpcClientConfig.KEY],
        useFactory: (config: ConfigType<typeof paymentsGrpcClientConfig>) => ({
          transport: Transport.GRPC,
          options: {
            package: REMARKGRAM_PAYMENTS_V1_PACKAGE_NAME,
            protoPath: PAYMENTS_GRPC_PROTO_PATH,
            url: config.url,
          },
        }),
      },
    ]),
  ],
  controllers: [PaymentsHttpController],
})
export class PaymentsModule {}
