import { Injectable } from '@nestjs/common';
import { PaymentsRepository } from '../ports/payments.repository.js';
import { PaymentNotFoundError } from '../errors/payment-use-case.errors.js';

@Injectable()
export class GetPaymentStatusUseCase {
  constructor(private readonly payments: PaymentsRepository) {}
  async execute(input: { paymentId: string; userId: number }) {
    const payment = await this.payments.findById(input.paymentId);
    if (!payment || payment.userId !== input.userId) throw new PaymentNotFoundError(input.paymentId);
    return {
      paymentId: payment.id,
      status: payment.status,
      paidAt: payment.paidAt?.toISOString() ?? undefined,
    };
  }
}
