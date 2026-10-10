import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { PaymentCustomersRepository, type PaymentCustomer } from '../ports/payment-customers.repository.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';

export type GetOrCreatePaymentCustomerParams = {
  userId: number;
  email?: string;
};

@Injectable()
export class PaymentCustomerService {
  constructor(
    private readonly customers: PaymentCustomersRepository,
    private readonly provider: PaymentProviderPort,
  ) {}

  async getOrCreate(params: GetOrCreatePaymentCustomerParams): Promise<PaymentCustomer> {
    const existingCustomer = await this.customers.findByUserAndProvider(
      params.userId,
      PaymentProvider.STRIPE,
    );
    if (existingCustomer) return existingCustomer;

    const providerCustomer = await this.provider.createCustomer({
      internalUserId: String(params.userId),
    });

    return this.customers.create({
      userId: params.userId,
      providerType: PaymentProvider.STRIPE,
      providerCustomerId: providerCustomer.providerCustomerId,
    });
  }
}
