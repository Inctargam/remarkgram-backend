import { InvalidSubscriptionAutoRenewalRequestError } from '../../errors/subscription-auto-renewal.errors.js';
import type {
  ChangeSubscriptionAutoRenewalParams,
  ChangeSubscriptionAutoRenewalWorkflowParams,
} from '../../types/subscription-auto-renewal.types.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createAutoRenewalWorkflowParams(
  params: ChangeSubscriptionAutoRenewalParams,
  autoRenewalEnabled: boolean,
): ChangeSubscriptionAutoRenewalWorkflowParams {
  if (!Number.isSafeInteger(params.userId) || params.userId <= 0) {
    throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_USER_ID');
  }
  if (!UUID_V4_PATTERN.test(params.subscriptionId)) {
    throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_SUBSCRIPTION_ID');
  }
  if (!UUID_V4_PATTERN.test(params.idempotencyKey)) {
    throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_IDEMPOTENCY_KEY');
  }
  return {
    workflowId: `subscription-auto-renewal:${params.userId}:${params.idempotencyKey.toLowerCase()}`,
    userId: params.userId,
    subscriptionId: params.subscriptionId.toLowerCase(),
    autoRenewalEnabled,
  };
}
