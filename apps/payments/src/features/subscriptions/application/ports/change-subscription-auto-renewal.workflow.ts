import type {
  ChangeSubscriptionAutoRenewalResult,
  ChangeSubscriptionAutoRenewalWorkflowParams,
} from '../types/subscription-auto-renewal.types.js';

export abstract class ChangeSubscriptionAutoRenewalWorkflow {
  abstract execute(
    params: ChangeSubscriptionAutoRenewalWorkflowParams,
  ): Promise<ChangeSubscriptionAutoRenewalResult>;
}
