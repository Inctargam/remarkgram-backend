import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import { stripeConfig } from '../../../../config/stripe.config.js';
import { PeriodUnit } from '../../../plans/domain/plan.entity.js';
import { InvalidProviderEventError } from '../../../../common/application/errors/payments.error.js';
import {
  PaymentProviderPort,
  type CreatePaymentCustomerProps,
  type CreatePaymentCustomerResult,
  type CreateProviderCheckoutInput,
  type CreateProviderCheckoutResult,
  type VerifiedProviderWebhook,
} from '../../application/ports/payment-provider.js';
import { CheckoutPurpose, PaymentProvider } from '../../domain/payment.entity.js';

@Injectable()
export class StripePaymentProvider extends PaymentProviderPort {
  private readonly logger = new Logger(StripePaymentProvider.name);
  private readonly stripe: Stripe;
  constructor(@Inject(stripeConfig.KEY) private readonly config: ConfigType<typeof stripeConfig>) {
    super();
    this.stripe = new Stripe(config.secretKey);
  }

  async createCheckout(input: CreateProviderCheckoutInput): Promise<CreateProviderCheckoutResult> {
    // Режим Checkout определяется локальным бизнес-контекстом до обращения к Stripe.
    // Чтение Stripe Schedule здесь не защищало от конкурентного создания двух первых подписок.
    let session: Stripe.Checkout.Session;
    try {
      session =
        input.checkoutPurpose === CheckoutPurpose.INITIAL_SUBSCRIPTION
          ? await this.createSubscriptionCheckout(input)
          : await this.createOneTimeCheckout(input);
    } catch (error) {
      return this.classifyOperationError(error, {
        operation: 'CREATE_CHECKOUT',
        paymentId: input.paymentId,
      });
    }

    if (!session.url) return { outcome: 'UNKNOWN' };
    const providerPaymentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    return {
      outcome: 'CREATED',
      checkout: {
        checkoutId: session.id,
        checkoutUrl: session.url,
        providerPaymentId,
        providerSubscriptionId: this.getExpandableId(session.subscription),
        providerInvoiceId: this.getExpandableId(session.invoice),
        providerCustomerId: input.customerId,
        checkoutExpiresAt: new Date(session.expires_at * 1000),
        snapshot: {
          id: session.id,
          url: session.url,
          mode: session.mode,
          paymentStatus: session.payment_status,
          status: session.status,
        },
      },
    };
  }

  private createSubscriptionCheckout(input: CreateProviderCheckoutInput): Promise<Stripe.Checkout.Session> {
    // Subscription Checkout обязан содержать recurring Price. Метаданные копируются
    // в Subscription, чтобы последующие invoice/subscription webhook можно было связать с оплатой.
    return this.stripe.checkout.sessions.create(
      {
        mode: 'subscription',
        payment_method_types: ['card'],
        customer: input.customerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amount,
              recurring: {
                interval: this.toStripeInterval(input.periodUnit),
                interval_count: input.periodCount,
              },
              product_data: { name: 'Remarkgram subscription period' },
            },
          },
        ],
        metadata: { paymentId: input.paymentId },
        subscription_data: { metadata: { paymentId: input.paymentId } },
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        client_reference_id: input.paymentId,
      },
      { idempotencyKey: input.idempotencyKey },
    );
  }

  private createOneTimeCheckout(input: CreateProviderCheckoutInput): Promise<Stripe.Checkout.Session> {
    // Докупка оплачивается сейчас как разовый платеж. Фазу расписания можно добавлять
    // только после достоверного webhook, а не после возврата пользователя по success_url.
    return this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        customer: input.customerId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amount,
              product_data: { name: 'Remarkgram subscription period' },
            },
          },
        ],
        metadata: { paymentId: input.paymentId },
        payment_intent_data: { metadata: { paymentId: input.paymentId } },
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        client_reference_id: input.paymentId,
      },
      { idempotencyKey: input.idempotencyKey },
    );
  }

  private toStripeInterval(periodUnit: PeriodUnit): Stripe.Price.Recurring.Interval {
    switch (periodUnit) {
      case PeriodUnit.DAY:
        return 'day';
      case PeriodUnit.WEEK:
        return 'week';
      case PeriodUnit.MONTH:
        return 'month';
    }
  }

  private getExpandableId(value: string | { id: string } | null): string | null {
    return typeof value === 'string' ? value : (value?.id ?? null);
  }

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderWebhook {
    // Проверка выполняется по исходному raw body: любое предварительное JSON-преобразование
    // изменит байты запроса, и Stripe не сможет подтвердить подпись. При неверной подписи
    // constructEvent выбросит исключение, поэтому недоверенные данные дальше не обрабатываются.
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    } catch (error) {
      // Ошибка подписи является ошибкой входного запроса, а не временной ошибкой обработки.
      // Непроверенное событие нельзя сохранять или использовать для изменения Payment.
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) {
        throw new InvalidProviderEventError('Invalid Stripe webhook signature');
      }
      throw error;
    }

    const snapshot = JSON.parse(JSON.stringify(event)) as Record<string, unknown>;
    return {
      provider: PaymentProvider.STRIPE,
      id: event.id,
      type: event.type,
      createdAt: new Date(event.created * 1000),
      payload: event.data.object,
      snapshot,
    };
  }

  async createCustomer(props: CreatePaymentCustomerProps): CreatePaymentCustomerResult {
    try {
      const customer = await this.stripe.customers.create(
        {
          metadata: {
            internalUserId: String(props.internalUserId),
          },
        },
        { idempotencyKey: `customer:create:${props.internalUserId}` },
      );

      return { outcome: 'CREATED', providerCustomerId: customer.id };
    } catch (error) {
      return this.classifyOperationError(error, {
        operation: 'CREATE_CUSTOMER',
        internalUserId: props.internalUserId,
      });
    }
  }

  private classifyOperationError(
    error: unknown,
    context:
      | { operation: 'CREATE_CHECKOUT'; paymentId: string }
      | { operation: 'CREATE_CUSTOMER'; internalUserId: string },
  ) {
    let outcome: 'VALIDATION_ERROR' | 'UNAVAILABLE' | 'UNKNOWN';
    if (
      error instanceof Stripe.errors.StripeInvalidRequestError ||
      error instanceof Stripe.errors.StripeIdempotencyError
    ) {
      outcome = 'VALIDATION_ERROR';
    } else if (error instanceof Stripe.errors.StripeConnectionError) {
      outcome = 'UNKNOWN';
    } else if (
      error instanceof Stripe.errors.StripeAPIError ||
      error instanceof Stripe.errors.StripeRateLimitError
    ) {
      outcome = 'UNAVAILABLE';
    } else {
      outcome = 'UNKNOWN';
    }

    const providerError = error instanceof Stripe.errors.StripeError ? error : null;
    const details = {
      event: 'payment_provider_operation_failed',
      provider: 'STRIPE',
      ...context,
      classification: outcome,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      providerErrorType: providerError?.type,
      providerErrorCode: providerError?.code,
      providerRequestId: providerError?.requestId,
      providerStatusCode: providerError?.statusCode,
    };
    if (outcome === 'UNKNOWN') this.logger.error(details);
    else this.logger.warn(details);

    return { outcome };
  }
}
