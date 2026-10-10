import { Injectable } from '@nestjs/common';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { PaymentCustomersRepository, type PaymentCustomer } from '../ports/payment-customers.repository.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import {
  PaymentCheckoutReconciliationRequiredError,
  PaymentCustomerProviderError,
  PaymentPersistenceError,
  PaymentProviderOutcomeUnknownError,
} from '../../../../common/application/errors/payments.error.js';

export type GetOrCreatePaymentCustomerParams = {
  userId: number;
  providerType: PaymentProvider;
  email?: string;
};

@Injectable()
export class PaymentCustomerService {
  constructor(
    private readonly customers: PaymentCustomersRepository,
    private readonly provider: PaymentProviderPort,
  ) {}

  async getOrCreate(params: GetOrCreatePaymentCustomerParams): Promise<PaymentCustomer> {
    let existingCustomer: PaymentCustomer | null;
    try {
      existingCustomer = await this.customers.findByUserAndProvider(params.userId, params.providerType);
    } catch {
      throw new PaymentPersistenceError();
    }
    if (existingCustomer) return existingCustomer;

    let result: Awaited<ReturnType<PaymentProviderPort['createCustomer']>>;
    try {
      result = await this.provider.createCustomer({ internalUserId: String(params.userId) });
    } catch {
      throw new PaymentProviderOutcomeUnknownError();
    }
    if (result.outcome === 'UNAVAILABLE') throw new PaymentCustomerProviderError();
    if (result.outcome === 'UNKNOWN') throw new PaymentProviderOutcomeUnknownError();
    if (result.outcome === 'VALIDATION_ERROR') throw new PaymentCustomerProviderError(result.message);

    let customer: PaymentCustomer;
    try {
      customer = await this.customers.create({
        userId: params.userId,
        providerType: params.providerType,
        providerCustomerId: result.providerCustomerId,
      });
    } catch {
      throw new PaymentPersistenceError();
    }
    if (customer.providerCustomerId !== result.providerCustomerId)
      throw new PaymentCheckoutReconciliationRequiredError();
    return customer;
  }
}
