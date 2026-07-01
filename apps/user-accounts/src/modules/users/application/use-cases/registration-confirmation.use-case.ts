import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
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
      throw new Error('Confirmation code is invalid');
    }

    if (confirmation.isConfirmed) {
      throw new Error('Email is already confirmed');
    }

    if (!confirmation.expiration || confirmation.expiration < new Date()) {
      throw new Error('Confirmation code has expired');
    }

    await this.usersRepository.confirmUser(command.code);
  }
}
