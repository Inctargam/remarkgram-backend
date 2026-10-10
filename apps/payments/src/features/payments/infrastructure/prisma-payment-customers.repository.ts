import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service.js';
import {
  PaymentCustomersRepository,
  type CreatePaymentCustomerParams,
  type PaymentCustomer,
} from '../application/ports/payment-customers.repository.js';
import { PaymentProvider } from '../domain/payment.entity.js';

@Injectable()
export class PrismaPaymentCustomersRepository implements PaymentCustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserAndProvider(
    userId: number,
    providerType: PaymentProvider,
  ): Promise<PaymentCustomer | null> {
    const customer = await this.prisma.paymentCustomer.findUnique({
      where: { userId_providerType: { userId, providerType } },
    });
    return customer ? this.toDomain(customer) : null;
  }

  async create(params: CreatePaymentCustomerParams): Promise<PaymentCustomer> {
    const customer = await this.prisma.paymentCustomer.upsert({
      where: {
        userId_providerType: {
          userId: params.userId,
          providerType: params.providerType,
        },
      },
      create: params,
      update: {},
    });
    return this.toDomain(customer);
  }

  private toDomain(customer: {
    id: string;
    userId: number;
    providerType: string;
    providerCustomerId: string;
    createdAt: Date;
    updatedAt: Date;
  }): PaymentCustomer {
    return {
      ...customer,
      providerType: customer.providerType as PaymentProvider,
    };
  }
}
