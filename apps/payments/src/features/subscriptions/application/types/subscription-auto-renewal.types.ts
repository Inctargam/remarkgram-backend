import type { PaymentProvider } from '../../../payments/domain/payment-provider.factory.js';
import type { AutoRenewalOperation } from './subscriptions.types.js';
import type { AutoRenewalStatus } from '../../domain/enums/auto-renewal-status.enum.js';

export type ChangeSubscriptionAutoRenewalParams = {
  userId: number;
  subscriptionId: string;
  idempotencyKey: string;
  autoRenewalEnabled: boolean;
};

export type ChangeSubscriptionAutoRenewalInput = {
  userId: number;
  subscriptionId: string;
  autoRenewalEnabled: boolean;
};

export type ChangeSubscriptionAutoRenewalWorkflowParams = ChangeSubscriptionAutoRenewalInput & {
  workflowId: string;
};

export type SubscriptionAutoRenewalOperationParams = ChangeSubscriptionAutoRenewalInput & {
  operationId: string;
};

export type ChangeSubscriptionAutoRenewalResult = {
  // Устойчивый ID запроса. Если настройка уже установлена, строка AutoRenewalOperation не создаётся.
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
  autoRenewalStatus: AutoRenewalStatus;
};

export type CompleteAutoRenewalOperationRepositoryParams = {
  operationId: string;
  autoRenewalStatus: AutoRenewalStatus;
};
