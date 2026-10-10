import type { PaymentProvider } from '../../domain/payment.entity.js';

export type PaymentCustomer = {
  id: string;
  userId: number;
  providerType: PaymentProvider;
  providerCustomerId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CreatePaymentCustomerParams = {
  userId: number;
  providerType: PaymentProvider;
  providerCustomerId: string;
};

export abstract class PaymentCustomersRepository {
  abstract findByUserAndProvider(
    userId: number,
    providerType: PaymentProvider,
  ): Promise<PaymentCustomer | null>;

  abstract create(params: CreatePaymentCustomerParams): Promise<PaymentCustomer>;
}
