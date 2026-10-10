import { describe, expect, it, vi } from 'vitest';
import { PaymentProvider } from '../../domain/payment.entity.js';
import type { PaymentProviderPort } from '../ports/payment-provider.js';
import type { PaymentCustomer, PaymentCustomersRepository } from '../ports/payment-customers.repository.js';
import { PaymentCustomerService } from './payment-customer.service.js';

describe('PaymentCustomerService', () => {
  it('returns the existing customer without calling the provider', async () => {
    const existing = paymentCustomer();
    const customers = {
      findByUserAndProvider: vi.fn().mockResolvedValue(existing),
      create: vi.fn(),
    } as unknown as PaymentCustomersRepository;
    const provider = { createCustomer: vi.fn() } as unknown as PaymentProviderPort;
    const service = new PaymentCustomerService(customers, provider);

    await expect(service.getOrCreate({ userId: 42, providerType: PaymentProvider.STRIPE })).resolves.toEqual(
      existing,
    );
    expect(provider.createCustomer).not.toHaveBeenCalled();
  });

  it('creates and stores a provider customer when one does not exist', async () => {
    const created = paymentCustomer();
    const customers = {
      findByUserAndProvider: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue(created),
    } as unknown as PaymentCustomersRepository;
    const provider = {
      createCustomer: vi.fn().mockResolvedValue({ outcome: 'CREATED', providerCustomerId: 'cus_123' }),
    } as unknown as PaymentProviderPort;
    const service = new PaymentCustomerService(customers, provider);

    await expect(service.getOrCreate({ userId: 42, providerType: PaymentProvider.STRIPE })).resolves.toEqual(
      created,
    );
    expect(provider.createCustomer).toHaveBeenCalledWith({
      internalUserId: '42',
    });
    expect(customers.create).toHaveBeenCalledWith({
      userId: 42,
      providerType: PaymentProvider.STRIPE,
      providerCustomerId: 'cus_123',
    });
  });
});

function paymentCustomer(): PaymentCustomer {
  return {
    id: 'customer-id',
    userId: 42,
    providerType: PaymentProvider.STRIPE,
    providerCustomerId: 'cus_123',
    createdAt: new Date('2026-10-05T00:00:00.000Z'),
    updatedAt: new Date('2026-10-05T00:00:00.000Z'),
  };
}
