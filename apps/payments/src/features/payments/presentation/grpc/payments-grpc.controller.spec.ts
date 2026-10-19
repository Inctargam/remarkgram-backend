import { describe, expect, it, vi } from 'vitest';
import { PaymentsGrpcController } from './payments-grpc.controller.js';
import type { CommandBus, QueryBus } from '@nestjs/cqrs';
import { CreateCheckoutCommand } from '../../application/use-cases/create-checkout.use-case.js';

describe('PaymentsGrpcController', () => {
  it('delegates checkout creation with converted input', async () => {
    const execute = vi
      .fn()
      .mockResolvedValue({ paymentId: 'p', checkoutUrl: 'https://checkout.stripe.com/x', status: 'PENDING' });
    const controller = new PaymentsGrpcController(
      { execute } as unknown as CommandBus,
      { execute: vi.fn() } as unknown as QueryBus,
    );
    await expect(
      controller.createCheckout({
        userId: 42,
        planId: 3,
        idempotencyKey: 'key',
        provider: 'STRIPE',
        autoRenewal: true,
      }),
    ).resolves.toEqual(expect.objectContaining({ paymentId: 'p' }));
    expect(execute).toHaveBeenCalledWith(
      new CreateCheckoutCommand({
        userId: 42,
        planId: 3,
        idempotencyKey: 'key',
        provider: 'STRIPE',
      }),
    );
  });

  it('preserves absence of a checkout URL in the gRPC response', async () => {
    const controller = new PaymentsGrpcController(
      {
        execute: vi.fn().mockResolvedValue({ paymentId: 'p', checkoutUrl: null, status: 'SUCCEEDED' }),
      } as unknown as CommandBus,
      { execute: vi.fn() } as unknown as QueryBus,
    );

    await expect(
      controller.createCheckout({
        userId: 42,
        planId: 3,
        idempotencyKey: 'key',
        provider: 'STRIPE',
      }),
    ).resolves.toEqual({ paymentId: 'p', checkoutUrl: undefined, status: 'SUCCEEDED' });
  });

  it('delegates read operations to the query bus', async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ paymentId: 'p' })
      .mockResolvedValueOnce({ items: [] });
    const controller = new PaymentsGrpcController(
      { execute: vi.fn() } as unknown as CommandBus,
      { execute } as unknown as QueryBus,
    );

    await expect(controller.getPlans({})).resolves.toEqual({ items: [] });
    await expect(controller.getPaymentStatus({ userId: 42, paymentId: 'p' })).resolves.toEqual({
      paymentId: 'p',
    });
    await expect(controller.getPayments({ userId: 42, pageNumber: 2, pageSize: 10 })).resolves.toEqual({
      items: [],
    });

    expect(execute).toHaveBeenCalledTimes(3);
    expect(execute.mock.calls[1]?.[0]).toMatchObject({ userId: 42, paymentId: 'p' });
    expect(execute.mock.calls[2]?.[0]).toMatchObject({ userId: 42, pageNumber: 2, pageSize: 10 });
  });
});
