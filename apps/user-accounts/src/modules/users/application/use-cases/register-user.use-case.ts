import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { RegisterUserParams } from '../types/users.types.js';
import { UsersService } from '../users.service.js';

export class RegisterUserCommand extends Command<void> {
  constructor(public readonly params: RegisterUserParams) {
    super();
  }
}

@CommandHandler(RegisterUserCommand)
export class RegisterUserUseCase implements ICommandHandler<RegisterUserCommand> {
  constructor(private readonly usersService: UsersService) {}

  async execute(command: RegisterUserCommand) {
    await this.usersService.registerUser(command.params);
  }
}
