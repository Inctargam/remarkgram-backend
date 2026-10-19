import { Injectable, Logger } from '@nestjs/common';
import { PaymentProvider } from '../../domain/payment.entity.js';
import { PaymentCustomersRepository, type PaymentCustomer } from '../ports/payment-customers.repository.js';
import { PaymentProviderPort } from '../ports/payment-provider.js';
import {
  PaymentCheckoutReconciliationRequiredError,
  PaymentPersistenceError,
  PaymentsError,
} from '../../../../common/application/errors/payments.error.js';
import { PaymentProviderOutcomeUnknownError } from '../errors/payment-provider.error.js';

export type GetOrCreatePaymentCustomerParams = {
  userId: number;
  providerType: PaymentProvider;
  email?: string;
};

@Injectable()
export class PaymentCustomerService {
  private readonly logger = new Logger(PaymentCustomerService.name);

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
    } catch (error) {
      if (error instanceof PaymentsError) throw error;
      this.logger.error({
        event: 'payment_provider_contract_violation',
        operation: 'CREATE_CUSTOMER',
        userId: params.userId,
        providerType: params.providerType,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      });
      throw new PaymentProviderOutcomeUnknownError();
    }
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
