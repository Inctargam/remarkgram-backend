import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ChangeSubscriptionAutoRenewalWorkflow } from '../../ports/change-subscription-auto-renewal.workflow.js';
import type {
  ChangeSubscriptionAutoRenewalParams,
  ChangeSubscriptionAutoRenewalResult,
} from '../../types/subscription-auto-renewal.types.js';
import { createAutoRenewalWorkflowParams } from '../change-subscription-auto-renewal/change-subscription-auto-renewal.policy.js';

export class DisableSubscriptionAutoRenewalCommand extends Command<ChangeSubscriptionAutoRenewalResult> {
  constructor(public readonly params: ChangeSubscriptionAutoRenewalParams) {
    super();
  }
}

@CommandHandler(DisableSubscriptionAutoRenewalCommand)
export class DisableSubscriptionAutoRenewalUseCase implements ICommandHandler<DisableSubscriptionAutoRenewalCommand> {
  constructor(private readonly workflow: ChangeSubscriptionAutoRenewalWorkflow) {}

  execute({ params }: DisableSubscriptionAutoRenewalCommand) {
    return this.workflow.execute(createAutoRenewalWorkflowParams(params, false));
  }
}
