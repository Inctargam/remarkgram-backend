import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { InvalidConfirmationCodeError } from '../errors/users.errors.js';
import { UsersRepository } from '../ports/users.repository.js';

export class ConfirmRegistrationCommand extends Command<void> {
  constructor(public readonly code: string) {
    super();
  }
}

@CommandHandler(ConfirmRegistrationCommand)
export class ConfirmRegistrationUseCase implements ICommandHandler<ConfirmRegistrationCommand> {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute(command: ConfirmRegistrationCommand) {
    const wasConfirmed = await this.usersRepository.confirmUser(command.code);

    if (!wasConfirmed) {
      // Ноль обновлённых строк означает любое несовпадение ожидаемого состояния: код отсутствует, истёк,
      // уже заменён конкурентным resend или использован другим confirm-запросом. Точную причину без нового
      // чтения определить нельзя, а повторное чтение само подвержено race condition, поэтому возвращаем
      // одну обобщённую ошибку недействительного confirmation code.
      throw new InvalidConfirmationCodeError();
    }
  }
}
