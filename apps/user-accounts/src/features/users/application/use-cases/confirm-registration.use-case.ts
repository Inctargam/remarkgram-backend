import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import {
  ConfirmationCodeExpiredError,
  EmailAlreadyConfirmedError,
  InvalidConfirmationCodeError,
} from '../errors/users.errors.js';
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
    const confirmation = await this.usersRepository.getConfirmationInfo(command.code);

    if (!confirmation) {
      throw new InvalidConfirmationCodeError();
    }

    if (confirmation.isConfirmed === true) {
      throw new EmailAlreadyConfirmedError();
    }

    const { wasConfirmed, checkedAt } = await this.usersRepository.confirmUser(command.code);

    if (!wasConfirmed) {
      // checkedAt намеренно возвращается из того же SQL statement, в котором CURRENT_TIMESTAMP проверяет
      // срок действия кода. Если после await создать новую дату, код может истечь уже после завершения UPDATE,
      // который вернул false по другой причине, например из-за конкурентного подтверждения пользователя.
      // Тогда более позднее время приложения ошибочно превратит EmailAlreadyConfirmedError в
      // ConfirmationCodeExpiredError. Сравнение с checkedAt фиксирует единый момент принятия решения в БД
      // и устраняет race condition при определении причины отказа.
      if (confirmation.isExpired(checkedAt)) {
        throw new ConfirmationCodeExpiredError();
      }

      throw new EmailAlreadyConfirmedError();
    }
  }
}
