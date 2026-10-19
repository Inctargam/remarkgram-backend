import type { ClientGrpc } from '@nestjs/microservices';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { AuthenticatedRequest } from '../../../../common/http/authenticated-request.js';
import { PaymentsHttpController } from './payments-http.controller.js';

describe(PaymentsHttpController.name, () => {
  const createCheckout = vi.fn();
  const getPaymentStatus = vi.fn();
  const getPayments = vi.fn();
  const controller = new PaymentsHttpController({
    getService: vi.fn(() => ({ createCheckout, getPaymentStatus, getPayments })),
  } as unknown as ClientGrpc);
  const request = { userId: '42' } as AuthenticatedRequest;

  beforeEach(() => {
    vi.clearAllMocks();
    controller.onModuleInit();
  });

  it('forwards the authenticated checkout request and preserves a nullable checkout URL', async () => {
    createCheckout.mockReturnValue(
      of({ paymentId: 'payment-id', checkoutUrl: undefined, status: 'SUCCEEDED' }),
    );

    await expect(
      controller.createCheckout(
        { planId: 1, provider: 'STRIPE' },
        request,
        '7b96a443-8b33-41cf-9bd9-2f57b720d39e',
      ),
    ).resolves.toEqual({ paymentId: 'payment-id', checkoutUrl: null, status: 'SUCCEEDED' });
    expect(createCheckout).toHaveBeenCalledWith({
      userId: 42,
      planId: 1,
      idempotencyKey: '7b96a443-8b33-41cf-9bd9-2f57b720d39e',
      provider: 'STRIPE',
    });
  });

  it('uses the authenticated owner for a status lookup and normalizes paidAt', async () => {
    getPaymentStatus.mockReturnValue(of({ paymentId: 'payment-id', status: 'PENDING' }));
    await expect(controller.getStatus({ paymentId: 'payment-id' }, request)).resolves.toEqual({
      paymentId: 'payment-id',
      status: 'PENDING',
      paidAt: null,
    });
    expect(getPaymentStatus).toHaveBeenCalledWith({ userId: 42, paymentId: 'payment-id' });
  });

  it('uses the authenticated owner and pagination for payment history', async () => {
    getPayments.mockReturnValue(of({ items: [], pageNumber: 2, pageSize: 10, totalCount: 0, pagesCount: 0 }));
    await expect(controller.getPayments({ pageNumber: 2, pageSize: 10 }, request)).resolves.toMatchObject({
      pageNumber: 2,
      pageSize: 10,
    });
    expect(getPayments).toHaveBeenCalledWith({ userId: 42, pageNumber: 2, pageSize: 10 });
  });
});
