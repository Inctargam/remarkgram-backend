import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { ScheduleModule } from '@nestjs/schedule';
import { databaseConfig } from './config/database.config.js';
import { paymentsConfig } from './config/payments.config.js';
import { stripeConfig } from './config/stripe.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { PaymentProviderPort } from './features/payments/application/ports/payment-provider.js';
import { PaymentCustomersRepository } from './features/payments/application/ports/payment-customers.repository.js';
import { PaymentsRepository } from './features/payments/application/ports/payments.repository.js';
import { SubscriptionContextPort } from './features/payments/application/ports/subscription-context.port.js';
import { PaymentCustomerService } from './features/payments/application/services/payment-customer.service.js';
import { CreateCheckoutUseCase } from './features/payments/application/use-cases/create-checkout.use-case.js';
import { GetPaymentStatusUseCase } from './features/payments/application/use-cases/get-payment-status.use-case.js';
import { ProcessStripeWebhookUseCase } from './features/payments/application/use-cases/process-stripe-webhook.use-case.js';
import { ProcessProviderWebhookUseCase } from './features/payments/application/use-cases/process-provider-webhook.use-case.js';
import { ApplySuccessfulPaymentUseCase } from './features/payments/application/use-cases/apply-successful-payment.use-case.js';
import { PaymentWebhookWorker } from './features/payments/application/workers/payment-webhook.worker.js';
import { PaymentSubscriptionLinkerWorker } from './features/payments/application/workers/payment-subscription-linker.worker.js';
import { SubscriptionPaymentHandler } from './features/payments/application/ports/subscription-payment-handler.js';
import { UnavailableSubscriptionPaymentHandler } from './features/payments/infrastructure/unavailable-subscription-payment.handler.js';
import { PrismaPaymentsRepository } from './features/payments/infrastructure/prisma-payments.repository.js';
import { PrismaPaymentCustomersRepository } from './features/payments/infrastructure/prisma-payment-customers.repository.js';
import { StripePaymentProvider } from './features/payments/infrastructure/stripe-payment.provider.js';
import { TemporarySubscriptionContextAdapter } from './features/payments/infrastructure/temporary-subscription-context.adapter.js';
import { PaymentsGrpcController } from './features/payments/presentation/grpc/payments-grpc.controller.js';
import { StripeWebhookController } from './features/payments/presentation/http/stripe-webhook.controller.js';
import { PlansRepository } from './features/plans/application/ports/plans.repository.js';
import { PrismaPlansRepository } from './features/plans/infrastructure/prisma-plans.repository.js';

@Module({
  imports: [
    CqrsModule,
    ScheduleModule.forRoot(),
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
    { provide: PaymentCustomersRepository, useClass: PrismaPaymentCustomersRepository },
    { provide: PaymentProviderPort, useClass: StripePaymentProvider },
    { provide: SubscriptionPaymentHandler, useClass: UnavailableSubscriptionPaymentHandler },
    // TODO: заменить на адаптер Subscription Module после появления межмодульного контракта.
    { provide: SubscriptionContextPort, useClass: TemporarySubscriptionContextAdapter },
    PaymentCustomerService,
    CreateCheckoutUseCase,
    GetPaymentStatusUseCase,
    ProcessStripeWebhookUseCase,
    ProcessProviderWebhookUseCase,
    ApplySuccessfulPaymentUseCase,
    PaymentWebhookWorker,
    PaymentSubscriptionLinkerWorker,
  ],
})
export class PaymentsModule {}
