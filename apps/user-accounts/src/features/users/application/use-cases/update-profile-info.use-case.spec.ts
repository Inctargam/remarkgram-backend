import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../../domain/entities/user.entity.js';
import { ConfirmationInfo } from '../../domain/value-objects/confirmation-info.js';
import { PersonalInfo } from '../../domain/value-objects/personal-info.js';
import { InvalidPersonalInfoFirstNameError } from '../errors/personal-info.errors.js';
import { UsernameAlreadyExistsError, UserNotFoundError } from '../errors/users.errors.js';
import { InvalidUsernamePatternError } from '../errors/username.errors.js';
import { type UsersRepository } from '../ports/users.repository.js';
import type { UpdateProfileInfoParams } from '../types/users.types.js';
import { UpdateProfileInfoCommand, UpdateProfileInfoUseCase } from './update-profile-info.use-case.js';

const user = User.restore({
  id: 1,
  username: 'ivanovich',
  hash: randomUUID(),
  deletedAt: null,
  createdAt: new Date('2026-09-12'),
  confirmation: ConfirmationInfo.confirmed(),
  email: 'ivan@gmail.com',
});

const requiredPersonalInfo: UpdateProfileInfoParams['personalInfo'] = {
  firstName: 'Ivan',
  lastName: 'Ivanov',
  dateOfBirth: null,
  aboutMe: null,
  countryCode: null,
  city: null,
};

const createProps = (override: Partial<UpdateProfileInfoParams> = {}): UpdateProfileInfoParams => ({
  userId: user.id,
  username: user.username,
  personalInfo: requiredPersonalInfo,
  ...override,
});

describe('UpdateProfileInfoUseCase', () => {
  const repository = {
    findById: vi.fn<UsersRepository['findById']>(),
    updateProfileInfo: vi.fn<UsersRepository['updateProfileInfo']>(),
    isUsernameExists: vi.fn<UsersRepository['isUsernameExists']>(),
  };
  const useCase = new UpdateProfileInfoUseCase(repository as unknown as UsersRepository);

  beforeEach(() => {
    vi.clearAllMocks();
    repository.findById.mockResolvedValue(user);
    repository.isUsernameExists.mockResolvedValue(false);
    repository.updateProfileInfo.mockResolvedValue(undefined);
  });

  it('updates all profile fields with normalized domain values', async () => {
    const props = createProps({
      username: '  NEW_User-01  ',
      personalInfo: {
        firstName: ' José ',
        lastName: ' Doe ',
        dateOfBirth: '1994-06-02',
        aboutMe: ' About me ',
        countryCode: ' ua ',
        city: ' Kyiv ',
      },
    });

    await useCase.execute(new UpdateProfileInfoCommand(props));

    expect(repository.findById).toHaveBeenCalledOnce();
    expect(repository.findById).toHaveBeenCalledWith(user.id);
    expect(repository.isUsernameExists).toHaveBeenCalledOnce();
    expect(repository.isUsernameExists).toHaveBeenCalledWith('new_user-01');
    expect(repository.updateProfileInfo).toHaveBeenCalledOnce();

    const [update] = repository.updateProfileInfo.mock.calls[0];
    expect(update.userId).toBe(user.id);
    expect(update.username).toBe('new_user-01');
    expect(update.personalInfo).toBeInstanceOf(PersonalInfo);
    expect(update.personalInfo.firstName).toBe('José');
    expect(update.personalInfo.lastName).toBe('Doe');
    expect(update.personalInfo.dateOfBirth?.value).toEqual(new Date(Date.UTC(1994, 5, 2)));
    expect(update.personalInfo.aboutMe).toBe('About me');
    expect(update.personalInfo.countryCode?.value).toBe('UA');
    expect(update.personalInfo.city?.value).toBe('Kyiv');
  });

  it('updates only mandatory profile fields and preserves null optionals', async () => {
    await useCase.execute(new UpdateProfileInfoCommand(createProps()));

    expect(repository.isUsernameExists).not.toHaveBeenCalled();
    expect(repository.updateProfileInfo).toHaveBeenCalledOnce();
    const [update] = repository.updateProfileInfo.mock.calls[0];
    expect(update).toMatchObject({ userId: user.id, username: user.username });
    expect(update.personalInfo).toEqual({
      firstName: 'Ivan',
      lastName: 'Ivanov',
      dateOfBirth: null,
      aboutMe: null,
      countryCode: null,
      city: null,
    });
  });

  it('does not check uniqueness when normalized username is unchanged', async () => {
    await useCase.execute(new UpdateProfileInfoCommand(createProps({ username: ' IVANOVICH ' })));

    expect(repository.isUsernameExists).not.toHaveBeenCalled();
    expect(repository.updateProfileInfo).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'ivanovich' }),
    );
  });

  it('checks a changed normalized username and updates when it is free', async () => {
    repository.isUsernameExists.mockResolvedValue(false);

    await useCase.execute(new UpdateProfileInfoCommand(createProps({ username: ' Free_Name ' })));

    expect(repository.isUsernameExists).toHaveBeenCalledWith('free_name');
    expect(repository.updateProfileInfo).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'free_name' }),
    );
  });

  it('rejects a changed username when its normalized value is taken', async () => {
    repository.isUsernameExists.mockResolvedValue(true);

    await expect(
      useCase.execute(new UpdateProfileInfoCommand(createProps({ username: ' Taken_Name ' }))),
    ).rejects.toBeInstanceOf(UsernameAlreadyExistsError);

    expect(repository.isUsernameExists).toHaveBeenCalledWith('taken_name');
    expect(repository.updateProfileInfo).not.toHaveBeenCalled();
  });

  it('stops immediately when the user does not exist', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute(new UpdateProfileInfoCommand(createProps()))).rejects.toBeInstanceOf(
      UserNotFoundError,
    );

    expect(repository.isUsernameExists).not.toHaveBeenCalled();
    expect(repository.updateProfileInfo).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid username', createProps({ username: 'invalid.name' }), InvalidUsernamePatternError],
    [
      'invalid personal info',
      createProps({ personalInfo: { ...requiredPersonalInfo, firstName: '   ' } }),
      InvalidPersonalInfoFirstNameError,
    ],
  ])('does not update for %s', async (_case, props, error) => {
    await expect(useCase.execute(new UpdateProfileInfoCommand(props))).rejects.toBeInstanceOf(error);
    expect(repository.updateProfileInfo).not.toHaveBeenCalled();
  });

  it('does not check username uniqueness when username validation fails', async () => {
    await expect(
      useCase.execute(new UpdateProfileInfoCommand(createProps({ username: 'invalid.name' }))),
    ).rejects.toBeInstanceOf(InvalidUsernamePatternError);

    expect(repository.isUsernameExists).not.toHaveBeenCalled();
  });

  it('propagates a repository update error', async () => {
    const error = new Error('database unavailable');
    repository.updateProfileInfo.mockRejectedValue(error);

    await expect(useCase.execute(new UpdateProfileInfoCommand(createProps()))).rejects.toBe(error);
    expect(repository.updateProfileInfo).toHaveBeenCalledOnce();
  });

  it('executes repository operations in the required order', async () => {
    await useCase.execute(new UpdateProfileInfoCommand(createProps({ username: 'new_name' })));

    const findOrder = repository.findById.mock.invocationCallOrder[0];
    const uniquenessOrder = repository.isUsernameExists.mock.invocationCallOrder[0];
    const updateOrder = repository.updateProfileInfo.mock.invocationCallOrder[0];
    expect(findOrder).toBeLessThan(uniquenessOrder);
    expect(uniquenessOrder).toBeLessThan(updateOrder);
  });
});
