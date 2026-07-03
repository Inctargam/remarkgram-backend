import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { User } from '../../domain/entities/user.entity.js';
import type { CreateUserParams } from '../types/users.types.js';
import { UsersService } from '../users.service.js';

export class CreateUserCommand extends Command<User> {
  constructor(public readonly params: CreateUserParams) {
    super();
  }
}

@CommandHandler(CreateUserCommand)
export class CreateUserUseCase implements ICommandHandler<CreateUserCommand> {
  constructor(private readonly usersService: UsersService) {}

  execute(command: CreateUserCommand) {
    return this.usersService.createUser(command.params);
  }
}
