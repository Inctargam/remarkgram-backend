import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { databaseConfig } from './config/database.config.js';
import { paymentsConfig } from './config/payments.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { PaymentsGrpcController } from './features/payments/presentation/grpc/payments-grpc.controller.js';

@Module({
  imports: [
    CqrsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      envFilePath: [
        `apps/payments/.env.${process.env.NODE_ENV}.local`,
        `apps/payments/.env.${process.env.NODE_ENV}`,
        'apps/payments/.env.production',
        'apps/payments/.env',
        `.env.${process.env.NODE_ENV}.local`,
        `.env.${process.env.NODE_ENV}`,
        '.env.production',
        '.env',
      ],
      load: [paymentsConfig, databaseConfig],
    }),
    PrismaModule,
  ],
  controllers: [PaymentsGrpcController],
  providers: [],
})
export class PaymentsModule {}
