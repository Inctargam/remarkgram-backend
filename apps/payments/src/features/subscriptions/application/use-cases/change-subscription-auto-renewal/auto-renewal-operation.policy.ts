import { AutoRenewalOperationStatus } from '../../../domain/enums/auto-renewal-operation-status.enum.js';
import { AutoRenewalOperationType } from '../../../domain/enums/auto-renewal-operation-type.enum.js';
import { SubscriptionAutoRenewalConflictError } from '../../errors/subscription-auto-renewal.errors.js';
import type { AutoRenewalOperation } from '../../types/subscriptions.types.js';
import type {
  PreparedSubscriptionAutoRenewalChange,
  SubscriptionAutoRenewalOperationParams,
} from '../../types/subscription-auto-renewal.types.js';

/** The operation retains its result even when a later operation changes the subscription. */
export function readManualAutoRenewalOperation(
  operation: AutoRenewalOperation,
  params: SubscriptionAutoRenewalOperationParams,
): PreparedSubscriptionAutoRenewalChange {
  const type = params.autoRenewalEnabled ? AutoRenewalOperationType.ENABLE : AutoRenewalOperationType.DISABLE;
  if (
    operation.id !== params.operationId ||
    operation.userId !== params.userId ||
    operation.subscriptionId !== params.subscriptionId ||
    operation.type !== type ||
    !operation.providerSubscriptionId ||
    (operation.status !== AutoRenewalOperationStatus.PENDING &&
      operation.status !== AutoRenewalOperationStatus.COMPLETED)
  ) {
    throw new SubscriptionAutoRenewalConflictError('OPERATION_MISMATCH');
  }
  return {
    ...params,
    provider: operation.provider,
    providerSubscriptionId: operation.providerSubscriptionId,
    completed: operation.status === AutoRenewalOperationStatus.COMPLETED,
  };
}
