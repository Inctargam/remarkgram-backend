import { Injectable } from '@nestjs/common';
import { CheckoutPurpose, PaymentStatus, PaymentType, type Payment } from '../../../../domain/payment.entity.js';
import type { InvoicePaidEvent } from '../../../events/payment-event.js';
import type { PaymentsTransactionContext } from '../../../ports/payments-unit-of-work.js';
import { PaymentsRepository } from '../../../ports/payments.repository.js';
import type { ConfirmSuccessfulPaymentResult } from '../payment-event-processing.types.js';
import {
  PAYMENT_RECONCILIATION_CONFLICT,
  hasProviderReferenceConflict,
  paymentReconciliationConflictResult,
  type PaymentReconciliationConflict,
} from '../payment-reconciliation.policy.js';

@Injectable()
export class ConfirmInvoicePaidUseCase {
  constructor(private readonly payments: PaymentsRepository) {}

  async execute(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentResult> {
    if (event.payload.billingReason === 'subscription_create') return this.confirmInitialPurchase(event, ctx);
    if (event.payload.billingReason === 'subscription_cycle') return this.confirmRenewal(event, ctx);
    return { outcome: 'UNSUPPORTED_BILLING_REASON' };
  }

  private async confirmInitialPurchase(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentResult> {
    if (!event.payload.providerSubscriptionId) return { outcome: 'SUBSCRIPTION_REFERENCE_MISSING' };
    const payment = await this.findInitialPurchase(event, ctx);
    if (!payment) return { outcome: 'PAYMENT_NOT_FOUND' };
    const reconciliationConflict = this.findInitialReconciliationConflict(payment, event);
    if (reconciliationConflict) return paymentReconciliationConflictResult(reconciliationConflict);
    if (payment.status === PaymentStatus.SUCCEEDED)
      return { outcome: 'ALREADY_SUCCEEDED', payment };
    if (![PaymentStatus.CREATED, PaymentStatus.PENDING].includes(payment.status))
      return { outcome: 'INVALID_TRANSITION' };

    return this.payments.confirmSuccessfulPayment(
      {
        paymentId: payment.id,
        paidAt: event.payload.paidAt,
        providerPaymentId: event.payload.providerPaymentId,
        providerSubscriptionId: event.payload.providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId,
      },
      ctx,
    );
  }

  private async confirmRenewal(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<ConfirmSuccessfulPaymentResult> {
    const providerSubscriptionId = event.payload.providerSubscriptionId;
    if (!providerSubscriptionId) return { outcome: 'SUBSCRIPTION_REFERENCE_MISSING' };

    const sourcePayment = await this.payments.findByProviderSubscriptionId(
      event.provider,
      providerSubscriptionId,
      ctx,
    );
    if (!sourcePayment) return { outcome: 'PAYMENT_NOT_FOUND' };
    if (!sourcePayment.subscriptionId) return { outcome: 'SUBSCRIPTION_ID_MISSING' };

    const reconciliationConflict = this.findRenewalContextConflict(sourcePayment, event);
    if (reconciliationConflict) return paymentReconciliationConflictResult(reconciliationConflict);

    const persisted = await this.payments.createSuccessfulRenewal(
      {
        userId: sourcePayment.userId,
        planId: sourcePayment.planId,
        amount: sourcePayment.amount,
        currency: sourcePayment.currency,
        periodCount: sourcePayment.periodCount,
        periodUnit: sourcePayment.periodUnit,
        providerType: sourcePayment.providerType,
        providerPaymentId: event.payload.providerPaymentId,
        providerSubscriptionId,
        providerInvoiceId: event.payload.providerInvoiceId,
        providerCustomerId: event.payload.customerId ?? sourcePayment.providerCustomerId,
        subscriptionId: sourcePayment.subscriptionId,
        paidAt: event.payload.paidAt,
      },
      ctx,
    );
    if (persisted.outcome === PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT)
      return paymentReconciliationConflictResult(PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT);

    const persistedConflict = this.findRenewalReconciliationConflict(persisted.payment, event);
    if (persistedConflict) return paymentReconciliationConflictResult(persistedConflict);
    return persisted.payment.subscriptionId === sourcePayment.subscriptionId
      ? { outcome: 'SUCCEEDED', payment: persisted.payment }
      : paymentReconciliationConflictResult(PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT);
  }

  private async findInitialPurchase(
    event: InvoicePaidEvent,
    ctx: PaymentsTransactionContext,
  ): Promise<Payment | null> {
    if (event.paymentId) return this.payments.findById(event.paymentId, ctx);
    const byInvoice = await this.payments.findByProviderInvoiceId(
      event.provider,
      event.payload.providerInvoiceId,
      ctx,
    );
    if (byInvoice) return byInvoice;
    return null;
  }

  private findInitialReconciliationConflict(
    payment: Payment,
    event: InvoicePaidEvent,
  ): ReconciliationConflict {
    if (payment.providerType !== event.provider) return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    if (
      payment.type !== PaymentType.PURCHASE ||
      payment.checkoutPurpose !== CheckoutPurpose.INITIAL_SUBSCRIPTION
    )
      return PAYMENT_RECONCILIATION_CONFLICT.PURPOSE_MISMATCH;
    return this.findFinancialOrReferenceConflict(payment, event);
  }

  private findRenewalContextConflict(payment: Payment, event: InvoicePaidEvent): ReconciliationConflict {
    if (payment.providerType !== event.provider) return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    if (payment.amount !== event.payload.amount) return PAYMENT_RECONCILIATION_CONFLICT.AMOUNT_MISMATCH;
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase())
      return PAYMENT_RECONCILIATION_CONFLICT.CURRENCY_MISMATCH;
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return PAYMENT_RECONCILIATION_CONFLICT.CUSTOMER_MISMATCH;
    return hasProviderReferenceConflict([
      payment.providerSubscriptionId,
      event.payload.providerSubscriptionId,
    ])
      ? PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT
      : null;
  }

  private findRenewalReconciliationConflict(
    renewal: Payment,
    event: InvoicePaidEvent,
  ): ReconciliationConflict {
    if (renewal.providerType !== event.provider) return PAYMENT_RECONCILIATION_CONFLICT.PROVIDER_MISMATCH;
    if (renewal.type !== PaymentType.RENEWAL) return PAYMENT_RECONCILIATION_CONFLICT.PURPOSE_MISMATCH;
    if (renewal.subscriptionId === null) return 'SUBSCRIPTION_ID_MISSING';
    if (renewal.status !== PaymentStatus.SUCCEEDED || renewal.paidAt === null) return 'INVALID_TRANSITION';
    return this.findFinancialOrReferenceConflict(renewal, event);
  }

  private findFinancialOrReferenceConflict(
    payment: Payment,
    event: InvoicePaidEvent,
  ): ReconciliationConflict {
    if (payment.amount !== event.payload.amount) return PAYMENT_RECONCILIATION_CONFLICT.AMOUNT_MISMATCH;
    if (payment.currency.toLowerCase() !== event.payload.currency.toLowerCase())
      return PAYMENT_RECONCILIATION_CONFLICT.CURRENCY_MISMATCH;
    if (
      payment.providerCustomerId !== null &&
      event.payload.customerId !== null &&
      payment.providerCustomerId !== event.payload.customerId
    )
      return PAYMENT_RECONCILIATION_CONFLICT.CUSTOMER_MISMATCH;

    return hasProviderReferenceConflict(
      [payment.providerPaymentId, event.payload.providerPaymentId],
      [payment.providerSubscriptionId, event.payload.providerSubscriptionId],
      [payment.providerInvoiceId, event.payload.providerInvoiceId],
    )
      ? PAYMENT_RECONCILIATION_CONFLICT.REFERENCE_CONFLICT
      : null;
  }
}

type ReconciliationConflict =
  | PaymentReconciliationConflict
  | 'SUBSCRIPTION_ID_MISSING'
  | 'INVALID_TRANSITION'
  | null;
