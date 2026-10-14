import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { databaseConfig } from './config/database.config.js';
import { dbosConfig } from './config/dbos.config.js';
import { paymentsConfig } from './config/payments.config.js';
import { stripeConfig } from './config/stripe.config.js';
import { PrismaModule } from './database/prisma.module.js';
import { PaymentProviderPort } from './features/payments/application/ports/payment-provider.js';
import { PaymentEventRepository } from './features/payments/application/ports/payment-event.repository.js';
import { PROVIDER_EVENT_ADAPTERS } from './features/payments/application/ports/provider-event-adapter.js';
import { PaymentCustomersRepository } from './features/payments/application/ports/payment-customers.repository.js';
import { PaymentsRepository } from './features/payments/application/ports/payments.repository.js';
import { PaymentWebhookWorkflow } from './features/payments/application/ports/payment-webhook.workflow.js';
import { SubscriptionContextPort } from './features/payments/application/ports/subscription-context.port.js';
import { SubscriptionPaymentHandler } from './features/payments/application/ports/subscription-payment.handler.js';
import { PaymentCustomerService } from './features/payments/application/services/payment-customer.service.js';
import { CreateCheckoutUseCase } from './features/payments/application/use-cases/create-checkout.use-case.js';
import { ConfirmPaymentIntentSucceededUseCase } from './features/payments/application/use-cases/payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import { ConfirmInvoicePaidUseCase } from './features/payments/application/use-cases/payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import { ApplyCheckoutSessionCompletedUseCase } from './features/payments/application/use-cases/payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.js';
import { CancelExpiredCheckoutSessionUseCase } from './features/payments/application/use-cases/payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import { RecordPaymentIntentFailedUseCase } from './features/payments/application/use-cases/payment-events/record-payment-intent-failed/record-payment-intent-failed.use-case.js';
import { RecordInvoicePaymentFailedUseCase } from './features/payments/application/use-cases/payment-events/record-invoice-payment-failed/record-invoice-payment-failed.use-case.js';
import { ApplyPaymentEventUseCase } from './features/payments/application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import { CreateDeferredProviderSubscriptionUseCase } from './features/payments/application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import { LinkPaymentToSubscriptionUseCase } from './features/payments/application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import { ScheduleProviderSubscriptionCancellationUseCase } from './features/payments/application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import { GetPaymentStatusUseCase } from './features/payments/application/use-cases/get-payment-status.use-case.js';
import { ProcessStripeWebhookUseCase } from './features/payments/application/use-cases/process-stripe-webhook.use-case.js';
import { ReceivePaymentEventUseCase } from './features/payments/application/use-cases/receive-payment-event.use-case.js';
import { PrismaPaymentsRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payments.repository.js';
import { PrismaPaymentEventRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payment-event.repository.js';
import { PrismaPaymentCustomersRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payment-customers.repository.js';
import { StripePaymentProvider } from './features/payments/infrastructure/stripe/stripe-payment.provider.js';
import { StripeCheckoutSessionCompletedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-checkout-session-completed.adapter.js';
import { StripeCheckoutSessionExpiredAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-checkout-session-expired.adapter.js';
import { StripeInvoicePaidAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-paid.adapter.js';
import { StripePaymentIntentSucceededAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-payment-intent-succeeded.adapter.js';
import { StripePaymentIntentPaymentFailedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-payment-intent-payment-failed.adapter.js';
import { StripeInvoicePaymentFailedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-payment-failed.adapter.js';
import { DbosLifecycleService } from './features/payments/infrastructure/dbos/dbos-lifecycle.service.js';
import { DbosPaymentWebhookWorkflow } from './features/payments/infrastructure/dbos/dbos-payment-webhook.workflow.js';
import { PaymentsDbosDataSource } from './features/payments/infrastructure/dbos/payments-dbos.datasource.js';
import { TemporarySubscriptionContextAdapter } from './features/payments/infrastructure/subscriptions/temporary-subscription-context.adapter.js';
import { TemporarySubscriptionPaymentHandlerAdapter } from './features/payments/infrastructure/subscriptions/temporary-subscription-payment-handler.adapter.js';
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
      load: [paymentsConfig, databaseConfig, stripeConfig, dbosConfig],
    }),
    PrismaModule,
  ],
  controllers: [PaymentsGrpcController, StripeWebhookController],
  providers: [
    { provide: PlansRepository, useClass: PrismaPlansRepository },
    { provide: PaymentsRepository, useClass: PrismaPaymentsRepository },
    { provide: PaymentEventRepository, useClass: PrismaPaymentEventRepository },
    { provide: PaymentCustomersRepository, useClass: PrismaPaymentCustomersRepository },
    { provide: PaymentProviderPort, useClass: StripePaymentProvider },
    StripeCheckoutSessionCompletedAdapter,
    StripeCheckoutSessionExpiredAdapter,
    StripeInvoicePaidAdapter,
    StripePaymentIntentSucceededAdapter,
    StripePaymentIntentPaymentFailedAdapter,
    StripeInvoicePaymentFailedAdapter,
    {
      provide: PROVIDER_EVENT_ADAPTERS,
      useFactory: (
        checkoutCompleted: StripeCheckoutSessionCompletedAdapter,
        checkoutExpired: StripeCheckoutSessionExpiredAdapter,
        invoicePaid: StripeInvoicePaidAdapter,
        paymentIntentSucceeded: StripePaymentIntentSucceededAdapter,
        paymentIntentFailed: StripePaymentIntentPaymentFailedAdapter,
        invoicePaymentFailed: StripeInvoicePaymentFailedAdapter,
      ) => [
        checkoutCompleted,
        checkoutExpired,
        invoicePaid,
        paymentIntentSucceeded,
        paymentIntentFailed,
        invoicePaymentFailed,
      ],
      inject: [
        StripeCheckoutSessionCompletedAdapter,
        StripeCheckoutSessionExpiredAdapter,
        StripeInvoicePaidAdapter,
        StripePaymentIntentSucceededAdapter,
        StripePaymentIntentPaymentFailedAdapter,
        StripeInvoicePaymentFailedAdapter,
      ],
    },
    // TODO: заменить на адаптер Subscription Module после появления межмодульного контракта.
    { provide: SubscriptionContextPort, useClass: TemporarySubscriptionContextAdapter },
    {
      provide: SubscriptionPaymentHandler,
      useClass: TemporarySubscriptionPaymentHandlerAdapter,
    },
    PaymentCustomerService,
    CreateCheckoutUseCase,
    ApplyCheckoutSessionCompletedUseCase,
    CancelExpiredCheckoutSessionUseCase,
    ConfirmPaymentIntentSucceededUseCase,
    ConfirmInvoicePaidUseCase,
    RecordPaymentIntentFailedUseCase,
    RecordInvoicePaymentFailedUseCase,
    ApplyPaymentEventUseCase,
    CreateDeferredProviderSubscriptionUseCase,
    LinkPaymentToSubscriptionUseCase,
    ScheduleProviderSubscriptionCancellationUseCase,
    GetPaymentStatusUseCase,
    ReceivePaymentEventUseCase,
    ProcessStripeWebhookUseCase,
    PaymentsDbosDataSource,
    DbosPaymentWebhookWorkflow,
    { provide: PaymentWebhookWorkflow, useExisting: DbosPaymentWebhookWorkflow },
    DbosLifecycleService,
  ],
})
export class PaymentsModule {}
