import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { ChangeSubscriptionAutoRenewalWorkflow } from '../../ports/change-subscription-auto-renewal.workflow.js';
import type {
  ChangeSubscriptionAutoRenewalParams,
  ChangeSubscriptionAutoRenewalResult,
} from '../../types/subscription-auto-renewal.types.js';
import { createAutoRenewalWorkflowParams } from '../change-subscription-auto-renewal/change-subscription-auto-renewal.policy.js';

export class EnableSubscriptionAutoRenewalCommand extends Command<ChangeSubscriptionAutoRenewalResult> {
  constructor(public readonly params: ChangeSubscriptionAutoRenewalParams) {
    super();
  }
}

@CommandHandler(EnableSubscriptionAutoRenewalCommand)
export class EnableSubscriptionAutoRenewalUseCase implements ICommandHandler<EnableSubscriptionAutoRenewalCommand> {
  constructor(private readonly workflow: ChangeSubscriptionAutoRenewalWorkflow) {}

  execute({ params }: EnableSubscriptionAutoRenewalCommand) {
    return this.workflow.execute(createAutoRenewalWorkflowParams(params, true));
  }
}
