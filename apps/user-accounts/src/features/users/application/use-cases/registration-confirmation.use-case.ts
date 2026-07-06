import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ConfirmationCodeExpiredError,
  EmailAlreadyConfirmedError,
  InvalidConfirmationCodeError,
} from '../errors/users.errors.js';
import { UsersRepository } from '../ports/users.repository.js';

export class RegistrationConfirmationCommand extends Command<void> {
  constructor(public readonly code: string) {
    super();
  }
}

@CommandHandler(RegistrationConfirmationCommand)
export class RegistrationConfirmationUseCase implements ICommandHandler<RegistrationConfirmationCommand> {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(command: RegistrationConfirmationCommand) {
    const confirmation = await this.usersRepository.getConfirmationInfo(command.code);

    if (!confirmation) {
      throw new InvalidConfirmationCodeError();
    }

    if (confirmation.isConfirmed === true) {
      throw new EmailAlreadyConfirmedError();
    }

    if (confirmation.isExpired(new Date())) {
      throw new ConfirmationCodeExpiredError();
    }

    const wasConfirmed = await this.usersRepository.confirmUser(command.code);

    if (!wasConfirmed) {
      throw new EmailAlreadyConfirmedError();
    }
  }
}
