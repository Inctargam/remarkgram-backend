import type { PaymentEventRepository } from '../../ports/payment-event.repository.js';
import type { PaymentProviderPort } from '../../ports/payment-provider.js';
import type { PaymentsRepository } from '../../ports/payments.repository.js';
import { PaymentStatus } from '../../../domain/payment.entity.js';
import { CloseCanceledSubscriptionInvoiceUseCase } from './close-canceled-subscription-invoice.use-case.js';

describe('CloseCanceledSubscriptionInvoiceUseCase', () => {
  const provider = { voidInvoice: vi.fn() };
  const payments = { cancelPendingPayment: vi.fn(), findById: vi.fn() };
  const events = { attachPayment: vi.fn(), markProcessed: vi.fn() };
  const useCase = new CloseCanceledSubscriptionInvoiceUseCase(
    provider as unknown as PaymentProviderPort,
    payments as unknown as PaymentsRepository,
    events as unknown as PaymentEventRepository,
  );
  const params = { eventId: 'event-id', paymentId: 'payment-id', providerInvoiceId: 'in_open' };
  const ctx = {};

  beforeEach(() => vi.clearAllMocks());

  it('uses the Invoice identity for an idempotent provider void', async () => {
    provider.voidInvoice.mockResolvedValue({ providerInvoiceId: 'in_open', status: 'VOIDED' });

    await expect(useCase.closeAtProvider(params)).resolves.toEqual({ ...params, status: 'VOIDED' });
    expect(provider.voidInvoice).toHaveBeenCalledWith({
      providerInvoiceId: 'in_open',
      operationId: 'in_open',
    });
  });

  it('cancels the local pending renewal only after provider void', async () => {
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'CANCELED' });

    await useCase.recordClosed({ ...params, status: 'VOIDED' }, ctx);

    expect(payments.cancelPendingPayment).toHaveBeenCalledWith(
      { paymentId: 'payment-id', providerInvoiceId: 'in_open' },
      ctx,
    );
    expect(events.attachPayment).toHaveBeenCalledWith('event-id', 'payment-id', ctx);
    expect(events.markProcessed).toHaveBeenCalledWith('event-id', ctx);
  });

  it('accepts an invoice.voided race that already canceled the Payment', async () => {
    payments.cancelPendingPayment.mockResolvedValue({ outcome: 'INVALID_TRANSITION' });
    payments.findById.mockResolvedValue({ status: PaymentStatus.CANCELED });

    await expect(useCase.recordClosed({ ...params, status: 'VOIDED' }, ctx)).resolves.toBeUndefined();
  });

  it('finishes a paid race only after invoice.paid confirmed the local Payment', async () => {
    payments.findById.mockResolvedValue({ status: PaymentStatus.SUCCEEDED });
    await useCase.recordClosed({ ...params, status: 'PAID' }, ctx);

    expect(payments.cancelPendingPayment).not.toHaveBeenCalled();
    expect(events.markProcessed).toHaveBeenCalledWith('event-id', ctx);
  });

  it('retries a paid race while the local Payment is still pending', async () => {
    payments.findById.mockResolvedValue({ status: PaymentStatus.PENDING });

    await expect(useCase.recordClosed({ ...params, status: 'PAID' }, ctx)).rejects.toMatchObject({
      reason: 'INVOICE_PAYMENT_NOT_CONFIRMED',
    });
    expect(events.markProcessed).not.toHaveBeenCalled();
  });
});
