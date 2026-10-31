import type { ApplySuccessfulPaymentResult } from '../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../payments/application/types/successful-payment.types.js';
import type { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import type { AutoRenewalOperationStatus } from '../../domain/enums/auto-renewal-operation-status.enum.js';
import type { AutoRenewalOperationType } from '../../domain/enums/auto-renewal-operation-type.enum.js';
import type { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';

export type SubscriptionForPayment = {
  subscriptionId: string;
  planId: number;
  provider: SuccessfulPayment['provider'];
  providerSubscriptionId: string | null;
  startsAt: Date;
  expiresAt: Date;
  status: SubscriptionStatus;
  autoRenewalStatus: AutoRenewalStatus;
};

export type CreateSubscriptionRepositoryParams = {
  paymentId: string;
  subscriptionId: string;
  userId: number;
  planId: number;
  startsAt: Date;
  expiresAt: Date;
  status: SubscriptionStatus;
  provider: SuccessfulPayment['provider'];
  providerSubscriptionId: string | null;
  autoRenewalStatus: AutoRenewalStatus;
  action: 'CREATED' | 'SCHEDULED';
  nextSubscriptionStartsAt: string;
  autoRenewalTransfer: {
    sourceSubscriptionId: string;
    sourceProviderSubscriptionId: string;
  } | null;
};

export type RenewSubscriptionRepositoryParams = {
  paymentId: string;
  subscriptionId: string;
  expiresAt: Date;
  status: SubscriptionStatus;
  nextSubscriptionStartsAt: string;
};

export type SetSubscriptionAutoRenewalRepositoryParams = {
  subscriptionId: string;
  status: AutoRenewalStatus;
};

export type AutoRenewalOperation = {
  id: string;
  userId: number;
  type: AutoRenewalOperationType;
  status: AutoRenewalOperationStatus;
  paymentId: string | null;
  subscriptionId: string;
  provider: SuccessfulPayment['provider'];
  providerSubscriptionId: string | null;
  sourceSubscriptionId: string | null;
  sourceProviderSubscriptionId: string | null;
};

export type SubscriptionPaymentApplication = {
  paymentId: string;
  userId: number;
  result: ApplySuccessfulPaymentResult;
  autoRenewalOperation: AutoRenewalOperation | null;
};

export type BindProviderSubscriptionRepositoryParams = {
  operationId: string;
  providerSubscriptionId: string;
};
