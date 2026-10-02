import { Injectable } from '@nestjs/common';
import { PlansRepository } from '../../../plans/application/ports/plans.repository.js';
import { Payment, PaymentProvider, PaymentStatus } from '../../domain/payment.entity.js';
import {
  PaymentIdempotencyConflictError,
  PaymentProviderUnavailableError,
  PlanNotFoundError,
} from '../errors/payment-use-case.errors.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import { PaymentsRepository } from '../ports/payments.repository.js';

export type CreateCheckoutInput = { userId: number; planId: number; idempotencyKey: string };
export type CreateCheckoutOutput = { paymentId: string; checkoutUrl: string; status: PaymentStatus };

@Injectable()
export class CreateCheckoutUseCase {
  constructor(
    private readonly plans: PlansRepository,
    private readonly payments: PaymentsRepository,
    private readonly provider: PaymentProviderPort,
  ) {}

  async execute(input: CreateCheckoutInput): Promise<CreateCheckoutOutput> {
    let payment = await this.payments.findByUserAndIdempotency(input.userId, input.idempotencyKey);

    // Поврторная операция на создание оплаты. Оплата находиться в состояние CREATED и содержит все знания о провайдере
    if (payment && payment.providerSnapshot && [PaymentStatus.CREATED].includes(payment.status)) {
      const checkoutUrl = payment.providerSnapshot.checkoutUrl;
      if (typeof checkoutUrl === 'string')
        return { paymentId: payment.id, checkoutUrl, status: payment.status };
    }
    // Повторная операция на создание оплаты. Но оплата уже находиться не в консистентном состоянии для продолжения.
    // Например: оплата уже подтверждена
    if (payment && PaymentStatus.PENDING !== payment.status) {
      throw new PaymentIdempotencyConflictError();
    }

    if (payment && payment?.planId !== input.planId) {
      throw new PaymentIdempotencyConflictError();
    }

    if (!payment) {
      const plan = await this.plans.findById({ id: input.planId });
      if (!plan) throw new PlanNotFoundError(input.planId);
      const newPayment = Payment.create({
        userId: input.userId,
        planId: plan.id,
        amount: plan.price,
        currency: plan.currency,
        periodCount: plan.periodCount,
        periodUnit: plan.periodUnit,
        providerType: PaymentProvider.STRIPE,
        idempotentKey: input.idempotencyKey,
      });
      try {
        payment = await this.payments.create(newPayment);
      } catch (error) {
        payment = await this.payments.findByUserAndIdempotency(input.userId, input.idempotencyKey);
        if (!payment) throw error;
        if (payment.planId !== input.planId) throw new PaymentIdempotencyConflictError();
      }
    }
    // Выше Payment либо создаеться либо извлекаеться по idempotencyKey в статусе Pending и создаеться checkout
    try {
      const checkout = await this.provider.createCheckout({
        paymentId: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        idempotencyKey: payment.idempotentKey,
      });
      const saved = await this.payments.attachCheckout(payment.id, {
        ...checkout,
        snapshot: { ...checkout.snapshot, checkoutUrl: checkout.checkoutUrl },
      });
      return { paymentId: saved.id, checkoutUrl: checkout.checkoutUrl, status: saved.status };
    } catch {
      throw new PaymentProviderUnavailableError();
    }
  }
}
