import { describe, expect, it, vi } from 'vitest';
import { PaymentsGrpcController } from './payments-grpc.controller.js';
import type { CreateCheckoutUseCase } from '../../application/use-cases/create-checkout.use-case.js';
import type { GetPaymentStatusUseCase } from '../../application/use-cases/get-payment-status.use-case.js';

describe('PaymentsGrpcController', () => {
  it('delegates checkout creation with converted input', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ paymentId: 'p', checkoutUrl: 'https://checkout.stripe.com/x', status: 'PENDING' });
    const controller = new PaymentsGrpcController(
      { execute } as unknown as CreateCheckoutUseCase,
      { execute: vi.fn() } as unknown as GetPaymentStatusUseCase,
    );
    await expect(
      controller.createCheckout({ userId: 42, planId: 3, idempotencyKey: 'key' }),
    ).resolves.toEqual(expect.objectContaining({ paymentId: 'p' }));
    expect(execute).toHaveBeenCalledWith({ userId: 42, planId: 3, idempotencyKey: 'key' });
  });
});
