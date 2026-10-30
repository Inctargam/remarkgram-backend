import type { PaymentProvider } from '../../../payments/domain/payment-provider.factory.js';
import type { AutoRenewalOperation } from './subscriptions.types.js';
import type { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';

export type ChangeSubscriptionAutoRenewalParams = {
  userId: number;
  subscriptionId: string;
  idempotencyKey: string;
};

export type SubscriptionAutoRenewalIntent = {
  userId: number;
  subscriptionId: string;
  autoRenewalEnabled: boolean;
};

export type ChangeSubscriptionAutoRenewalWorkflowParams = SubscriptionAutoRenewalIntent & {
  workflowId: string;
};

export type SubscriptionAutoRenewalOperationParams = SubscriptionAutoRenewalIntent & {
  operationId: string;
};

export type ChangeSubscriptionAutoRenewalResult = {
  operationId: string;
  subscriptionId: string;
  autoRenewalEnabled: boolean;
};

export type PreparedSubscriptionAutoRenewalChange = SubscriptionAutoRenewalOperationParams & {
  provider: PaymentProvider;
  providerSubscriptionId: string;
  completed: boolean;
};

export type CreateAutoRenewalOperationRepositoryParams = {
  operation: AutoRenewalOperation;
  // null: desired state is already set; record the result without changing the subscription.
  autoRenewalStatus: AutoRenewalStatus | null;
};

export type CompleteAutoRenewalOperationRepositoryParams = {
  operationId: string;
  autoRenewalStatus: AutoRenewalStatus;
};
