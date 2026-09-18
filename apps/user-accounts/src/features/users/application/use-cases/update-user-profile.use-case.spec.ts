import { beforeEach, describe, expect, vi } from 'vitest';
import { type UsersRepository } from '../ports/users.repository.js';
import { UpdateUserProfileCommand, UpdateUserProfileUseCase } from './update-user-profile.use-case.js';
import { User } from '../../domain/entities/user.entity.js';
import { randomUUID } from 'node:crypto';
import { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import { Username } from '../../domain/value-objects/username.js';
import { PersonalInfo } from '../../domain/value-objects/personal-info.js';
import { BirthDate } from '../../domain/value-objects/birth-date.js';
import type { UpdateUserProfileParams } from '../types/users.types.js';
import { UsernameAlreadyExistsError, UserNotFoundError } from '../errors/users.errors.js';
import { InvalidUsernamePatternError } from '../errors/username.errors.js';
import {
  InvalidPersonalInfoFirstNameError,
  InvalidPersonalInfoLastNameError,
} from '../errors/personal-info.errors.js';

describe('UpdateUserProfileCommand', () => {
  const user = User.restore({
    id: 1,
    username: 'ivanovich',
    hash: randomUUID(),
    deletedAt: null,
    createdAt: new Date('2026-09-12'),
    confirmation: ConfirmationInfo.confirmed(),
    email: 'ivan@gmail.com',
  });

  const repository = {
    findById: vi.fn<UsersRepository['findById']>(),
    updateProfile: vi.fn<UsersRepository['updateProfile']>(),
    isUsernameExists: vi.fn<UsersRepository['isUsernameExists']>(),
  };
  const UsernameSpy = vi.spyOn(Username, 'create');
  const PersonalInfoSpy = vi.spyOn(PersonalInfo, 'create');
  const BirthdaySpy = vi.spyOn(BirthDate, 'create');

  const useCase = new UpdateUserProfileUseCase(repository as unknown as UsersRepository);

  beforeEach(() => {
    repository.findById.mockReset();
    repository.updateProfile.mockReset();
    repository.isUsernameExists.mockReset();

    UsernameSpy.mockReset();
    PersonalInfoSpy.mockReset();
    BirthdaySpy.mockReset();
  });

  it('should update the profile successfully when all fields are provided ', async () => {
    const personalInfo = {
      firstName: 'Ivan',
      lastName: 'Ivanovich',
      dateOfBirth: '02.06.1994',
      aboutMe: 'Hello everyone! Welcome to me profile.',
      city: null,
      countryCode: null,
    };
    const props = {
      userId: user.id,
      username: user.username,
      personalInfo: personalInfo,
    };
    repository.findById.mockResolvedValue(user);
    repository.isUsernameExists.mockResolvedValue(false);

    const command = new UpdateUserProfileCommand(props);
    await useCase.execute(command);

    expect(UsernameSpy).toHaveBeenCalledWith(props.username);
    expect(UsernameSpy).toHaveBeenCalledOnce();

    expect(PersonalInfoSpy).toHaveBeenCalledWith({
      firstName: personalInfo.firstName,
      lastName: personalInfo.lastName,
      dateOfBirth: personalInfo.dateOfBirth,
      aboutMe: personalInfo.aboutMe,
      city: personalInfo.city,
      countryCode: personalInfo.countryCode,
    });
    expect(PersonalInfoSpy).toHaveBeenCalledOnce();
    expect(repository.updateProfile).toHaveBeenCalledOnce();
    expect(repository.updateProfile).toHaveBeenCalledWith({
      userId: props.userId,
      username: props.username,
      personalInfo: PersonalInfo.restore({
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        dateOfBirth: new Date(Date.UTC(1994, 5, 2)),
        aboutMe: personalInfo.aboutMe,
        countryCode: null,
        city: null,
      }),
    });
  });

  it('should update the  profile successfully when only required fields are provided', async () => {
    const personalInfo = {
      firstName: 'Ivan',
      lastName: 'Ivanovich',
      dateOfBirth: null,
      aboutMe: null,
      city: null,
      countryCode: null,
    };
    const props = {
      userId: user.id,
      username: user.username,
      personalInfo: personalInfo,
    };
    repository.findById.mockResolvedValue(user);
    repository.isUsernameExists.mockResolvedValue(false);

    const command = new UpdateUserProfileCommand(props);
    await useCase.execute(command);

    expect(UsernameSpy).toHaveBeenCalledWith(props.username);
    expect(UsernameSpy).toHaveBeenCalledOnce();

    expect(PersonalInfoSpy).toHaveBeenCalledWith({
      firstName: personalInfo.firstName,
      lastName: personalInfo.lastName,
      dateOfBirth: null,
      aboutMe: null,
      city: null,
      countryCode: null,
    });
    expect(PersonalInfoSpy).toHaveBeenCalledOnce();
    expect(repository.updateProfile).toHaveBeenCalledOnce();
    expect(repository.updateProfile).toHaveBeenCalledWith({
      userId: props.userId,
      username: props.username,
      personalInfo: PersonalInfo.restore({
        firstName: personalInfo.firstName,
        lastName: personalInfo.lastName,
        dateOfBirth: null,
        aboutMe: null,
        city: null,
        countryCode: null,
      }),
    });
  });

  it('rejects when user does not exist', async () => {
    repository.findById.mockResolvedValue(null);
    const props = { userId: 1 } as unknown as UpdateUserProfileParams;

    try {
      await useCase.execute(new UpdateUserProfileCommand(props));
    } catch (err) {
      expect(err).toBeInstanceOf(UserNotFoundError);
    }
  });

  it('returns an error if the specified username already exists in the system', async () => {
    repository.findById.mockResolvedValue(user);
    repository.isUsernameExists.mockResolvedValue(true);
    const props = { userId: 1, username: 'username_taken' } as unknown as UpdateUserProfileParams;

    try {
      await useCase.execute(new UpdateUserProfileCommand(props));
    } catch (err) {
      expect(err).toBeInstanceOf(UsernameAlreadyExistsError);
    }
  });
  it.each([
    [{ userId: 1, username: 'uSer@name' }, InvalidUsernamePatternError],
    [{ userId: 1, username: '  user12&0)jj) ' }, InvalidUsernamePatternError],
  ])('returns an error if username invalid', async (props, exeption) => {
    repository.findById.mockResolvedValue(user);

    await expect(
      useCase.execute(new UpdateUserProfileCommand(props as unknown as UpdateUserProfileParams)),
    ).rejects.toBeInstanceOf(exeption);

    expect(repository.isUsernameExists).not.toHaveBeenCalledOnce();
    expect(PersonalInfoSpy).not.toHaveBeenCalledOnce();
    expect(BirthdaySpy).not.toHaveBeenCalledOnce();
    expect(repository.updateProfile).not.toHaveBeenCalledOnce();
  });
  it.each([
    [
      { username: 'ivanovich', personalInfo: { firstName: '   ', lastName: 'Ivanovich' } },
      InvalidPersonalInfoFirstNameError,
    ],
    [
      { username: 'ivanovich', personalInfo: { firstName: 'Ivan', lastName: '   ' } },
      InvalidPersonalInfoLastNameError,
    ],
  ])('returns an error if required fields personal info are provided empty', async (props, exeption) => {
    repository.findById.mockResolvedValue(user);
    repository.isUsernameExists.mockResolvedValue(false);

    await expect(
      useCase.execute(new UpdateUserProfileCommand(props as unknown as UpdateUserProfileParams)),
    ).rejects.toBeInstanceOf(exeption);

    expect(PersonalInfoSpy).toHaveBeenCalledOnce();
    expect(repository.updateProfile).not.toHaveBeenCalledOnce();
  });
});
