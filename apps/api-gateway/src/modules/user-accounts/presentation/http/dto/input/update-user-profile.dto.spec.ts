import { describe, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserProfileDto } from './update-user-profile.dto.js';

describe('UpdateUserProfileDto', () => {
  it('should pass validation when all fields are provided', async () => {
    const dto = plainToInstance(UpdateUserProfileDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
      dateOfBirth: '11.01.2001',
      aboutMe: 'aboutMe',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('should pass validation when mandatory fields are provided', async () => {
    const dto = plainToInstance(UpdateUserProfileDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });
  it.each([
    [
      {
        username: '',
        firstName: 'username',
        lastName: 'username',
      },
      'username',
    ],
    [
      {
        username: 'username',
        firstName: '',
        lastName: 'username',
      },
      'firstName',
    ],
    [
      {
        username: 'username',
        firstName: 'username',
        lastName: '',
      },
      'lastName',
    ],
  ])('$1 - should fail validation when mandatory is empty', async (payload, errorProperty) => {
    const dto = plainToInstance(UpdateUserProfileDto, payload);
    const errors = await validate(dto);
    expect(errors).toContainEqual(
      expect.objectContaining({
        property: errorProperty,
      }),
    );
  });

  it('should fail validation when dateOfBirth has an invalid format', async () => {
    const dto = plainToInstance(UpdateUserProfileDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
      dateOfBirth: '12-12-2012',
    });
    const errors = await validate(dto);
    expect(errors).toContainEqual(
      expect.objectContaining({
        property: 'dateOfBirth',
      }),
    );
  });
});
