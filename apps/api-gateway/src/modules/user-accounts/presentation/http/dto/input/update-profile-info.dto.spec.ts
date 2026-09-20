import { describe, expect } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileInfoDto } from './update-profile-info.dto.js';

describe('UpdateProfileInfoDto', () => {
  it('should pass validation when all fields are provided', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
      dateOfBirth: '2001-01-11',
      aboutMe: 'aboutMe',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('should pass validation when mandatory fields are provided', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each([
    ['José', 'O’Connor'],
    ['Іван', 'Петренко'],
    ['Anne-Marie', 'van der Waals'],
  ])('should accept international personal names', async (firstName, lastName) => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName,
      lastName,
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('should normalize and accept a lowercase country code', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'John',
      lastName: 'Doe',
      countryCode: ' ua ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.countryCode).toBe('UA');
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
    const dto = plainToInstance(UpdateProfileInfoDto, payload);
    const errors = await validate(dto);
    expect(errors).toContainEqual(
      expect.objectContaining({
        property: errorProperty,
      }),
    );
  });

  it('should fail validation when dateOfBirth has an invalid format', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'username',
      lastName: 'username',
      dateOfBirth: '12.12.2012',
    });
    const errors = await validate(dto);
    expect(errors).toContainEqual(
      expect.objectContaining({
        property: 'dateOfBirth',
      }),
    );
  });

  it.each([
    ['countryCode', { countryCode: 'UKR' }],
    ['countryCode', { countryCode: 'U1' }],
    ['city', { city: 'Kyiv123' }],
    ['city', { city: 'a'.repeat(101) }],
  ])('should fail validation when %s violates the shared policy', async (property, fields) => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'John',
      lastName: 'Doe',
      ...fields,
    });

    const errors = await validate(dto);
    expect(errors).toContainEqual(expect.objectContaining({ property }));
  });

  it.each([
    ['firstName', { firstName: 'John123' }],
    ['firstName', { firstName: 'John?' }],
    ['lastName', { lastName: '@Doe' }],
    ['lastName', { lastName: 'Doe!' }],
  ])('should reject %s when it violates the name pattern', async (property, fields) => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: 'username',
      firstName: 'John',
      lastName: 'Doe',
      ...fields,
    });

    const errors = await validate(dto);
    expect(errors).toContainEqual(expect.objectContaining({ property }));
  });
});
