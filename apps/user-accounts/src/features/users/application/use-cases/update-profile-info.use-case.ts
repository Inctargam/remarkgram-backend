import { Command, CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { UpdateProfileInfoParams } from '../types/users.types.js';
import { UsersRepository } from '../ports/users.repository.js';
import { UsernameAlreadyExistsError, UserNotFoundError } from '../errors/users.errors.js';
import { PersonalInfo } from '../../domain/value-objects/personal-info.js';
import { Username } from '../../domain/value-objects/username.js';

export class UpdateProfileInfoCommand extends Command<void> {
  constructor(public props: UpdateProfileInfoParams) {
    super();
  }
}

@CommandHandler(UpdateProfileInfoCommand)
export class UpdateProfileInfoUseCase implements ICommandHandler<UpdateProfileInfoCommand> {
  constructor(private repository: UsersRepository) {}

  async execute({ props }: UpdateProfileInfoCommand) {
    const { userId, username, personalInfo } = props;
    const user = await this.repository.findById(userId);

    if (!user) {
      throw new UserNotFoundError();
    }

    const newUsername = Username.create(username).value;

    if (user.username !== newUsername && (await this.repository.isUsernameExists(newUsername))) {
      throw new UsernameAlreadyExistsError();
    }

    const personaInfoVo = PersonalInfo.create({
      firstName: personalInfo.firstName,
      lastName: personalInfo.lastName,
      dateOfBirth: personalInfo?.dateOfBirth ?? null,
      aboutMe: personalInfo?.aboutMe ?? null,
      city: personalInfo.city ?? null,
      countryCode: personalInfo?.countryCode ?? null,
    });

    await this.repository.updateProfileInfo({
      userId: user.id,
      username: newUsername,
      personalInfo: personaInfoVo,
    });
  }
}
