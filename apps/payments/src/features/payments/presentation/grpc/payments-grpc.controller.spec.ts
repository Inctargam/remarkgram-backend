import { describe, expect, it, vi } from 'vitest';
import { PaymentsGrpcController } from './payments-grpc.controller.js';
import type { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case.js';
import type { CommandBus } from '@nestjs/cqrs';
import { CreateCheckoutCommand } from '../../application/use-cases/create-checkout.use-case.js';

describe('PaymentsGrpcController', () => {
  it('delegates checkout creation with converted input', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ paymentId: 'p', checkoutUrl: 'https://checkout.stripe.com/x', status: 'PENDING' });
    const controller = new PaymentsGrpcController(
      { execute } as unknown as CommandBus,
      { execute: vi.fn() } as unknown as GetPaymentStatusUseCase,
    );
    await expect(
      controller.createCheckout({ userId: 42, planId: 3, idempotencyKey: 'key', provider: 'STRIPE', autoRenewal: true }),
    ).resolves.toEqual(expect.objectContaining({ paymentId: 'p' }));
    expect(execute).toHaveBeenCalledWith(
      new CreateCheckoutCommand({ userId: 42, planId: 3, idempotencyKey: 'key', provider: 'STRIPE', autoRenewal: true }),
    );
  });
});
