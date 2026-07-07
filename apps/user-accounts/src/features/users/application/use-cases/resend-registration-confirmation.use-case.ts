import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { authConfig } from '../../../../config/auth.config.js';
import { EmailService } from '../../../notifications/email.service.js';
import { EmailAlreadyConfirmedError, IncorrectEmailError } from '../errors/users.errors.js';
import { UsersRepository } from '../ports/users.repository.js';

export class ResendRegistrationConfirmationCommand extends Command<void> {
  constructor(public readonly email: string) {
    super();
  }
}

@CommandHandler(ResendRegistrationConfirmationCommand)
export class ResendRegistrationConfirmationUseCase implements ICommandHandler<ResendRegistrationConfirmationCommand> {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly emailService: EmailService,
    @Inject(authConfig.KEY) private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async execute(command: ResendRegistrationConfirmationCommand) {
    const user = await this.usersRepository.findByEmail(command.email);

    if (!user) {
      throw new IncorrectEmailError();
    }

    const expectedCode = user.confirmation.code;
    if (user.confirmation.isConfirmed || expectedCode === null) {
      throw new EmailAlreadyConfirmedError();
    }

    const code = crypto.randomUUID();
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + this.auth.confirmationCodeExpiresIn);

    // expectedCode превращает обновление в compare-and-swap: если конкурентный resend уже заменил код,
    // этот запрос обновит ноль строк и не отправит второе письмо с уже невалидным кодом.
    const wasUpdated = await this.usersRepository.updateConfirmationCode({
      userId: user.id,
      expectedCode,
      newCode: code,
      expiration,
    });

    if (!wasUpdated) {
      // Запись не обновилась, потому что после чтения пользователя её состояние изменил другой запрос:
      // например, конкурентный resend уже заменил ожидаемый confirmation code или пользователь подтвердил email.
      // Поэтому нельзя считать, что email обязательно подтверждён, и выбрасывать EmailAlreadyConfirmedError.
      // Завершаем запрос успешно без дополнительных изменений и отправки письма: новый код этого запроса
      // не сохранён, а актуальный код уже записал другой конкурентный запрос.
      return;
    }

    await this.emailService.sendConfirmationCode(command.email, code);
  }
}
