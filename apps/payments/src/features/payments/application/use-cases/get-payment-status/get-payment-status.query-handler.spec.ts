import { describe, expect, it, vi } from 'vitest';
import { PaymentNotFoundError } from '../../../../../common/application/errors/payments.error.js';
import type { PaymentsQueryRepository } from '../../ports/payments.query-repository.js';
import { GetPaymentStatusQuery, GetPaymentStatusQueryHandler } from './get-payment-status.query-handler.js';

describe(GetPaymentStatusQueryHandler.name, () => {
  const findStatusByUserAndId = vi.fn();
  const handler = new GetPaymentStatusQueryHandler({
    findStatusByUserAndId,
  } as unknown as PaymentsQueryRepository);

  it('returns an owned payment status', async () => {
    findStatusByUserAndId.mockResolvedValue({ paymentId: 'payment-id', status: 'PENDING' });
    await expect(handler.execute(new GetPaymentStatusQuery('payment-id', 42))).resolves.toEqual({
      paymentId: 'payment-id',
      status: 'PENDING',
    });
    expect(findStatusByUserAndId).toHaveBeenCalledWith(42, 'payment-id');
  });

  it('hides missing and non-owned payments behind the same not-found error', async () => {
    findStatusByUserAndId.mockResolvedValue(null);
    await expect(handler.execute(new GetPaymentStatusQuery('payment-id', 42))).rejects.toBeInstanceOf(
      PaymentNotFoundError,
    );
  });
});
