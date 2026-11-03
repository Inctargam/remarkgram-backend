import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidSubscriptionAutoRenewalRequestError } from '../../errors/subscription-auto-renewal.errors.js';
import { ChangeSubscriptionAutoRenewalWorkflow } from '../../ports/change-subscription-auto-renewal.workflow.js';
import type {
  ChangeSubscriptionAutoRenewalParams,
  ChangeSubscriptionAutoRenewalResult,
} from '../../types/subscription-auto-renewal.types.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ChangeSubscriptionAutoRenewalCommand extends Command<ChangeSubscriptionAutoRenewalResult> {
  constructor(public readonly params: ChangeSubscriptionAutoRenewalParams) {
    super();
  }
}

@CommandHandler(ChangeSubscriptionAutoRenewalCommand)
export class ChangeSubscriptionAutoRenewalUseCase implements ICommandHandler<ChangeSubscriptionAutoRenewalCommand> {
  constructor(private readonly workflow: ChangeSubscriptionAutoRenewalWorkflow) {}

  execute({ params }: ChangeSubscriptionAutoRenewalCommand) {
    if (!Number.isSafeInteger(params.userId) || params.userId <= 0) {
      throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_USER_ID');
    }
    if (!UUID_V4_PATTERN.test(params.subscriptionId)) {
      throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_SUBSCRIPTION_ID');
    }
    if (!UUID_V4_PATTERN.test(params.idempotencyKey)) {
      throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_IDEMPOTENCY_KEY');
    }
    if (typeof params.autoRenewalEnabled !== 'boolean') {
      throw new InvalidSubscriptionAutoRenewalRequestError('INVALID_AUTO_RENEWAL_ENABLED');
    }

    return this.workflow.execute({
      workflowId: `subscription-auto-renewal:${params.userId}:${params.idempotencyKey.toLowerCase()}`,
      userId: params.userId,
      subscriptionId: params.subscriptionId.toLowerCase(),
      autoRenewalEnabled: params.autoRenewalEnabled,
    });
  }
}
