import type { ApplySuccessfulPaymentResult } from '../../../payments/application/ports/subscription-payment.handler.js';
import type { SuccessfulPayment } from '../../../payments/application/types/successful-payment.types.js';
import type { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';
import type { SubscriptionPaymentProcessingStatus } from '../../domain/enums/subscription-payment-processing-status.enum.js';
import type { SubscriptionStatus } from '../../domain/enums/subscription-status.enum.js';

export type FindActiveSubscriptionResult = {
  subscriptionId: string;
};

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
  userId: number;
  planId: number;
  startsAt: Date;
  expiresAt: Date;
  status: SubscriptionStatus;
  provider: SuccessfulPayment['provider'];
  providerSubscriptionId: string | null;
  autoRenewalStatus: AutoRenewalStatus;
  autoRenewalChangeId: string | null;
  previousSubscriptionId: string | null;
  result: ApplySuccessfulPaymentResult;
  processingStatus: SubscriptionPaymentProcessingStatus;
};

export type RenewSubscriptionRepositoryParams = {
  paymentId: string;
  expiresAt: Date;
  status: SubscriptionStatus;
  result: ApplySuccessfulPaymentResult;
  processingStatus: SubscriptionPaymentProcessingStatus;
};

export type SetSubscriptionAutoRenewalRepositoryParams = {
  subscriptionId: string;
  status: AutoRenewalStatus;
  changeId: string;
};

export type SubscriptionPaymentApplication = {
  paymentId: string;
  userId: number;
  result: ApplySuccessfulPaymentResult;
  previousSubscriptionId: string | null;
  processingStatus: SubscriptionPaymentProcessingStatus;
  boundProviderSubscriptionId: string | null;
};

export type CompleteProviderSubscriptionCancellationRepositoryParams = {
  paymentId: string;
  autoRenewalStatus: AutoRenewalStatus;
  processingStatus: SubscriptionPaymentProcessingStatus;
};

export type BindProviderSubscriptionRepositoryParams = {
  paymentId: string;
  providerSubscriptionId: string;
  autoRenewalStatus: AutoRenewalStatus;
  processingStatus: SubscriptionPaymentProcessingStatus;
};
