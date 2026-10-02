import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Stripe from 'stripe';
import { stripeConfig } from '../../../config/stripe.config.js';
import {
  PaymentProviderPort,
  type CreateProviderCheckoutInput,
  type ProviderCheckout,
  type VerifiedProviderEvent,
} from '../application/ports/payment-provider.js';

@Injectable()
export class StripePaymentProvider extends PaymentProviderPort {
  private readonly stripe: Stripe;
  constructor(@Inject(stripeConfig.KEY) private readonly config: ConfigType<typeof stripeConfig>) {
    super();
    this.stripe = new Stripe(config.secretKey);
  }

  async createCheckout(input: CreateProviderCheckoutInput): Promise<ProviderCheckout> {
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency.toLowerCase(),
              unit_amount: input.amount,
              product_data: { name: 'Remarkgram subscription period' },
              // На второй итерации добавить параметры для recuring
              // recurring: {},
            },
          },
        ],
        metadata: { paymentId: input.paymentId },
        payment_intent_data: { metadata: { paymentId: input.paymentId } },
        // Ссылки введут фронт
        success_url: this.config.successUrl,
        cancel_url: this.config.cancelUrl,
        // Уточнить в доке
        client_reference_id: input.paymentId,
      },
      { idempotencyKey: input.idempotencyKey },
    );

    if (!session.url) throw new Error('Stripe did not return a Checkout URL');
    const providerPaymentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    return {
      checkoutId: session.id,
      checkoutUrl: session.url,
      paymentId: providerPaymentId,
      snapshot: {
        id: session.id,
        url: session.url,
        paymentStatus: session.payment_status,
        status: session.status,
      },
    };
  }

  verifyWebhook(rawBody: Buffer, signature: string): VerifiedProviderEvent {
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.config.webhookSecret);
    if (!event.type.startsWith('checkout.session.')) return this.ignored(event);
    const session = event.data.object as Stripe.Checkout.Session;
    const outcome = this.outcome(event.type, session);
    const providerPaymentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : (session.payment_intent?.id ?? null);
    return {
      eventId: event.id,
      eventType: event.type,
      internalPaymentId: session.metadata?.paymentId ?? null,
      checkoutId: session.id,
      providerPaymentId,
      amount: session.amount_total,
      currency: session.currency,
      outcome,
      snapshot: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
    };
  }

  private outcome(type: string, session: Stripe.Checkout.Session): VerifiedProviderEvent['outcome'] {
    if (type === 'checkout.session.completed')
      return session.payment_status === 'paid' ? 'SUCCEEDED' : 'IGNORED';
    if (type === 'checkout.session.async_payment_succeeded') return 'SUCCEEDED';
    if (type === 'checkout.session.async_payment_failed') return 'FAILED';
    if (type === 'checkout.session.expired') return 'CANCELED';
    return 'IGNORED';
  }

  private ignored(event: Stripe.Event): VerifiedProviderEvent {
    return {
      eventId: event.id,
      eventType: event.type,
      internalPaymentId: null,
      checkoutId: null,
      providerPaymentId: null,
      amount: null,
      currency: null,
      outcome: 'IGNORED',
      snapshot: JSON.parse(JSON.stringify(event)) as Record<string, unknown>,
    };
  }
}
