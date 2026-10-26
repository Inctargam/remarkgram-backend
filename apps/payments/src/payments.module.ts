import { ConfirmRenewalPaymentUseCase } from './features/payments/application/use-cases/payment-events/confirm-renewal-payment/confirm-renewal-payment.use-case.js';
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
import { PaymentsQueryRepository } from './features/payments/application/ports/payments.query-repository.js';
import { PaymentWebhookWorkflow } from './features/payments/application/ports/payment-webhook.workflow.js';
import { SubscriptionContextPort } from './features/payments/application/ports/subscription-context.port.js';
import { SubscriptionPaymentHandler } from './features/payments/application/ports/subscription-payment.handler.js';
import { PaymentCustomerService } from './features/payments/application/services/payment-customer.service.js';
import { CreateCheckoutUseCase } from './features/payments/application/use-cases/create-checkout.use-case.js';
import { ConfirmPaymentIntentSucceededUseCase } from './features/payments/application/use-cases/payment-events/confirm-payment-intent-succeeded/confirm-payment-intent-succeeded.use-case.js';
import { EnsureRenewalPaymentUseCase } from './features/payments/application/use-cases/payment-events/ensure-renewal-payment/ensure-renewal-payment.use-case.js';
import { StripeInvoiceFinalizedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-finalized.adapter.js';
import { ConfirmInvoicePaidUseCase } from './features/payments/application/use-cases/payment-events/confirm-invoice-paid/confirm-invoice-paid.use-case.js';
import { ApplyCheckoutSessionCompletedUseCase } from './features/payments/application/use-cases/payment-events/apply-checkout-session-completed/apply-checkout-session-completed.use-case.js';
import { CancelExpiredCheckoutSessionUseCase } from './features/payments/application/use-cases/payment-events/cancel-expired-checkout-session/cancel-expired-checkout-session.use-case.js';
import { CancelPaymentIntentUseCase } from './features/payments/application/use-cases/payment-events/cancel-payment-intent/cancel-payment-intent.use-case.js';
import { RecordPaymentIntentFailedUseCase } from './features/payments/application/use-cases/payment-events/record-payment-intent-failed/record-payment-intent-failed.use-case.js';
import { RecordInvoicePaymentFailedUseCase } from './features/payments/application/use-cases/payment-events/record-invoice-payment-failed/record-invoice-payment-failed.use-case.js';
import { CancelVoidedInvoiceUseCase } from './features/payments/application/use-cases/payment-events/cancel-voided-invoice/cancel-voided-invoice.use-case.js';
import { ApplyPaymentEventUseCase } from './features/payments/application/use-cases/process-payment-webhook/apply-payment-event.use-case.js';
import { CreateDeferredProviderSubscriptionUseCase } from './features/payments/application/use-cases/process-payment-webhook/create-deferred-provider-subscription.use-case.js';
import { LinkPaymentToSubscriptionUseCase } from './features/payments/application/use-cases/process-payment-webhook/link-payment-to-subscription.use-case.js';
import { ScheduleProviderSubscriptionCancellationUseCase } from './features/payments/application/use-cases/process-payment-webhook/schedule-provider-subscription-cancellation.use-case.js';
import { GetPaymentsQueryHandler } from './features/payments/application/use-cases/get-payments/get-payments.query-handler.js';
import { GetPaymentStatusQueryHandler } from './features/payments/application/use-cases/get-payment-status/get-payment-status.query-handler.js';
import { ProcessStripeWebhookUseCase } from './features/payments/application/use-cases/process-stripe-webhook.use-case.js';
import { ReceivePaymentEventUseCase } from './features/payments/application/use-cases/receive-payment-event.use-case.js';
import { SetProviderSubscriptionAutoRenewalUseCase } from './features/payments/application/use-cases/set-provider-subscription-auto-renewal/set-provider-subscription-auto-renewal.use-case.js';
import { PrismaPaymentsRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payments.repository.js';
import { PrismaPaymentsQueryRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payments.query-repository.js';
import { PrismaPaymentEventRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payment-event.repository.js';
import { PrismaPaymentCustomersRepository } from './features/payments/infrastructure/persistence/prisma/prisma-payment-customers.repository.js';
import { StripePaymentProvider } from './features/payments/infrastructure/stripe/stripe-payment.provider.js';
import { StripeCheckoutSessionCompletedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-checkout-session-completed.adapter.js';
import { StripeCheckoutSessionExpiredAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-checkout-session-expired.adapter.js';
import { StripeInvoicePaidAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-paid.adapter.js';
import { StripePaymentIntentSucceededAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-payment-intent-succeeded.adapter.js';
import { StripePaymentIntentPaymentFailedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-payment-intent-payment-failed.adapter.js';
import { StripePaymentIntentCanceledAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-payment-intent-canceled.adapter.js';
import { StripeInvoicePaymentFailedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-payment-failed.adapter.js';
import { StripeInvoiceVoidedAdapter } from './features/payments/infrastructure/stripe/event-adapters/stripe-invoice-voided.adapter.js';
import { DbosLifecycleService } from './features/payments/infrastructure/dbos/dbos-lifecycle.service.js';
import { DbosPaymentWebhookWorkflow } from './features/payments/infrastructure/dbos/dbos-payment-webhook.workflow.js';
import { PaymentsDbosDataSource } from './features/payments/infrastructure/dbos/payments-dbos.datasource.js';
import { PaymentsProviderSubscriptionAutoRenewalAdapter } from './features/payments/infrastructure/subscriptions/payments-provider-subscription-auto-renewal.adapter.js';
import { PaymentsGrpcController } from './features/payments/presentation/grpc/payments-grpc.controller.js';
import { StripeWebhookController } from './features/payments/presentation/http/stripe-webhook.controller.js';
import { PlansRepository } from './features/plans/application/ports/plans.repository.js';
import { PlansQueryRepository } from './features/plans/application/ports/plans.query-repository.js';
import { GetPlansQueryHandler } from './features/plans/application/use-cases/get-plans/get-plans.query-handler.js';
import { PrismaPlansRepository } from './features/plans/infrastructure/prisma-plans.repository.js';
import { PrismaPlansQueryRepository } from './features/plans/infrastructure/prisma-plans.query-repository.js';
import { SubscriptionsQueryRepository } from './features/subscriptions/application/ports/subscriptions-query.repository.js';
import { FindActiveSubscriptionForPurchaseQueryHandler } from './features/subscriptions/application/use-cases/find-active-subscription-for-purchase/find-active-subscription-for-purchase.query-handler.js';
import { LocalSubscriptionContextAdapter } from './features/subscriptions/infrastructure/payments/local-subscription-context.adapter.js';
import { PrismaSubscriptionsQueryRepository } from './features/subscriptions/infrastructure/persistence/prisma-subscriptions-query.repository.js';
import { SubscriptionsRepository } from './features/subscriptions/application/ports/subscriptions.repository.js';
import { ApplySuccessfulPaymentUseCase } from './features/subscriptions/application/use-cases/apply-successful-payment/apply-successful-payment.use-case.js';
import { MarkProviderSubscriptionCancellationScheduledUseCase } from './features/subscriptions/application/use-cases/mark-provider-subscription-cancellation-scheduled/mark-provider-subscription-cancellation-scheduled.use-case.js';
import { BindProviderSubscriptionUseCase } from './features/subscriptions/application/use-cases/bind-provider-subscription/bind-provider-subscription.use-case.js';
import { LocalSubscriptionPaymentHandlerAdapter } from './features/subscriptions/infrastructure/payments/local-subscription-payment-handler.adapter.js';
import { PrismaSubscriptionsRepository } from './features/subscriptions/infrastructure/persistence/prisma-subscriptions.repository.js';

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
    { provide: PlansQueryRepository, useClass: PrismaPlansQueryRepository },
    { provide: PaymentsRepository, useClass: PrismaPaymentsRepository },
    { provide: PaymentsQueryRepository, useClass: PrismaPaymentsQueryRepository },
    { provide: PaymentEventRepository, useClass: PrismaPaymentEventRepository },
    { provide: PaymentCustomersRepository, useClass: PrismaPaymentCustomersRepository },
    { provide: PaymentProviderPort, useClass: StripePaymentProvider },
    StripeCheckoutSessionCompletedAdapter,
    StripeCheckoutSessionExpiredAdapter,
    StripeInvoicePaidAdapter,
    StripeInvoiceFinalizedAdapter,
    StripePaymentIntentSucceededAdapter,
    StripePaymentIntentPaymentFailedAdapter,
    StripePaymentIntentCanceledAdapter,
    StripeInvoicePaymentFailedAdapter,
    StripeInvoiceVoidedAdapter,
    {
      provide: PROVIDER_EVENT_ADAPTERS,
      useFactory: (
        checkoutCompleted: StripeCheckoutSessionCompletedAdapter,
        checkoutExpired: StripeCheckoutSessionExpiredAdapter,
        invoicePaid: StripeInvoicePaidAdapter,
        invoiceFinalized: StripeInvoiceFinalizedAdapter,
        paymentIntentSucceeded: StripePaymentIntentSucceededAdapter,
        paymentIntentFailed: StripePaymentIntentPaymentFailedAdapter,
        paymentIntentCanceled: StripePaymentIntentCanceledAdapter,
        invoicePaymentFailed: StripeInvoicePaymentFailedAdapter,
        invoiceVoided: StripeInvoiceVoidedAdapter,
      ) => [
        checkoutCompleted,
        checkoutExpired,
        invoicePaid,
        invoiceFinalized,
        paymentIntentSucceeded,
        paymentIntentFailed,
        paymentIntentCanceled,
        invoicePaymentFailed,
        invoiceVoided,
      ],
      inject: [
        StripeCheckoutSessionCompletedAdapter,
        StripeCheckoutSessionExpiredAdapter,
        StripeInvoicePaidAdapter,
        StripeInvoiceFinalizedAdapter,
        StripePaymentIntentSucceededAdapter,
        StripePaymentIntentPaymentFailedAdapter,
        StripePaymentIntentCanceledAdapter,
        StripeInvoicePaymentFailedAdapter,
        StripeInvoiceVoidedAdapter,
      ],
    },
    { provide: SubscriptionContextPort, useClass: LocalSubscriptionContextAdapter },
    { provide: SubscriptionsQueryRepository, useClass: PrismaSubscriptionsQueryRepository },
    FindActiveSubscriptionForPurchaseQueryHandler,
    { provide: SubscriptionsRepository, useClass: PrismaSubscriptionsRepository },
    ApplySuccessfulPaymentUseCase,
    MarkProviderSubscriptionCancellationScheduledUseCase,
    BindProviderSubscriptionUseCase,
    {
      provide: SubscriptionPaymentHandler,
      useClass: LocalSubscriptionPaymentHandlerAdapter,
    },
    PaymentCustomerService,
    CreateCheckoutUseCase,
    ApplyCheckoutSessionCompletedUseCase,
    CancelExpiredCheckoutSessionUseCase,
    CancelPaymentIntentUseCase,
    ConfirmPaymentIntentSucceededUseCase,
    ConfirmInvoicePaidUseCase,
    ConfirmRenewalPaymentUseCase,
    EnsureRenewalPaymentUseCase,
    RecordPaymentIntentFailedUseCase,
    RecordInvoicePaymentFailedUseCase,
    CancelVoidedInvoiceUseCase,
    ApplyPaymentEventUseCase,
    CreateDeferredProviderSubscriptionUseCase,
    LinkPaymentToSubscriptionUseCase,
    ScheduleProviderSubscriptionCancellationUseCase,
    GetPlansQueryHandler,
    GetPaymentStatusQueryHandler,
    GetPaymentsQueryHandler,
    ReceivePaymentEventUseCase,
    SetProviderSubscriptionAutoRenewalUseCase,
    PaymentsProviderSubscriptionAutoRenewalAdapter,
    ProcessStripeWebhookUseCase,
    PaymentsDbosDataSource,
    DbosPaymentWebhookWorkflow,
    { provide: PaymentWebhookWorkflow, useExisting: DbosPaymentWebhookWorkflow },
    DbosLifecycleService,
  ],
  exports: [PaymentsProviderSubscriptionAutoRenewalAdapter],
})
export class PaymentsModule {}
