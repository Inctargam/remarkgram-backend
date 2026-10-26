/** Точные имена Stripe Events, поддерживаемых Payment Module. */
export enum StripeEventType {
  CHECKOUT_SESSION_COMPLETED = 'checkout.session.completed',
  CHECKOUT_SESSION_EXPIRED = 'checkout.session.expired',
  PAYMENT_INTENT_SUCCEEDED = 'payment_intent.succeeded',
  PAYMENT_INTENT_PAYMENT_FAILED = 'payment_intent.payment_failed',
  PAYMENT_INTENT_CANCELED = 'payment_intent.canceled',
  INVOICE_FINALIZED = 'invoice.finalized',
  INVOICE_PAID = 'invoice.paid',
  INVOICE_PAYMENT_FAILED = 'invoice.payment_failed',
  INVOICE_VOIDED = 'invoice.voided',
  CUSTOMER_SUBSCRIPTION_UPDATED = 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED = 'customer.subscription.deleted',
}
