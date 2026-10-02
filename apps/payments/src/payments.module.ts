import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { databaseConfig } from './config/database.config.js';
import { paymentsConfig } from './config/payments.config.js';
import { stripeConfig } from './config/stripe.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { PaymentProviderPort } from './features/payments/application/ports/payment-provider.js';
import { PaymentsRepository } from './features/payments/application/ports/payments.repository.js';
import { CreateCheckoutUseCase } from './features/payments/application/use-cases/create-checkout.use-case.js';
import { GetPaymentStatusUseCase } from './features/payments/application/use-cases/get-payment-status.use-case.js';
import { ProcessStripeWebhookUseCase } from './features/payments/application/use-cases/process-stripe-webhook.use-case.js';
import { PrismaPaymentsRepository } from './features/payments/infrastructure/prisma-payments.repository.js';
import { StripePaymentProvider } from './features/payments/infrastructure/stripe-payment.provider.js';
import { PaymentsGrpcController } from './features/payments/presentation/grpc/payments-grpc.controller.js';
import { StripeWebhookController } from './features/payments/presentation/http/stripe-webhook.controller.js';
import { PlansRepository } from './features/plans/application/ports/plans.repository.js';
import { PrismaPlansRepository } from './features/plans/infrastructure/prisma-plans.repository.js';

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
      load: [paymentsConfig, databaseConfig, stripeConfig],
    }),
    PrismaModule,
  ],
  controllers: [PaymentsGrpcController, StripeWebhookController],
  providers: [
    { provide: PlansRepository, useClass: PrismaPlansRepository },
    { provide: PaymentsRepository, useClass: PrismaPaymentsRepository },
    { provide: PaymentProviderPort, useClass: StripePaymentProvider },
    CreateCheckoutUseCase,
    GetPaymentStatusUseCase,
    ProcessStripeWebhookUseCase,
  ],
})
export class PaymentsModule {}
