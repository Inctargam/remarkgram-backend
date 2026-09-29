import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
  PERSONAL_INFO_CITY_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
  PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
  USERNAME_MAZ_LENGTH,
  USERNAME_MIN_LENGTH,
} from '@app/user-accounts-grpc';
import { UpdateProfileInfoDto } from './update-profile-info.dto.js';

const validPayload = { username: 'username', firstName: 'John', lastName: 'Doe' };

async function expectInvalid(payload: Record<string, unknown>, property: string): Promise<void> {
  const errors = await validate(plainToInstance(UpdateProfileInfoDto, payload));
  expect(errors).toContainEqual(expect.objectContaining({ property }));
}

describe('UpdateProfileInfoDto', () => {
  it('accepts and trims a complete valid payload', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      username: ' username-1 ',
      firstName: ' John ',
      lastName: ' Doe ',
      dateOfBirth: ' 2001-01-11 ',
      aboutMe: ' About me ',
      countryCode: ' ua ',
      city: ' Kyiv ',
    });

    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toMatchObject({
      username: 'username-1',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '2001-01-11',
      aboutMe: 'About me',
      countryCode: 'UA',
      city: 'Kyiv',
    });
  });

  it('accepts a payload containing only mandatory fields', async () => {
    await expect(validate(plainToInstance(UpdateProfileInfoDto, validPayload))).resolves.toEqual([]);
  });

  it.each([
    ['firstName', 'José'],
    ['firstName', 'Іван'],
    ['firstName', 'Anne-Marie'],
    ['lastName', 'O’Connor'],
    ['lastName', 'van der Waals'],
    ['lastName', 'Dʼarcy'],
  ])('accepts a Unicode-aware %s', async (property, value) => {
    await expect(
      validate(plainToInstance(UpdateProfileInfoDto, { ...validPayload, [property]: value })),
    ).resolves.toEqual([]);
  });

  it.each(['username', 'firstName', 'lastName'])('rejects an absent mandatory %s', async (property) => {
    const payload: Record<string, unknown> = { ...validPayload };
    delete payload[property];
    await expectInvalid(payload, property);
  });

  it.each([
    ['username', ''],
    ['firstName', '   '],
    ['lastName', ''],
  ])('rejects an empty mandatory %s', async (property, value) => {
    await expectInvalid({ ...validPayload, [property]: value }, property);
  });

  it.each([
    ['username', 123456],
    ['firstName', 123],
    ['lastName', false],
  ])('rejects a non-string mandatory %s', async (property, value) => {
    await expectInvalid({ ...validPayload, [property]: value }, property);
  });

  it.each([
    ['username', 'a'.repeat(USERNAME_MIN_LENGTH)],
    ['username', 'a'.repeat(USERNAME_MAZ_LENGTH)],
    ['firstName', 'A'],
    ['firstName', 'A'.repeat(PERSONAL_INFO_FIRST_NAME_MAX_LENGTH)],
    ['lastName', 'D'],
    ['lastName', 'D'.repeat(PERSONAL_INFO_LAST_NAME_MAX_LENGTH)],
  ])('accepts %s at a configured length boundary', async (property, value) => {
    await expect(
      validate(plainToInstance(UpdateProfileInfoDto, { ...validPayload, [property]: value })),
    ).resolves.toEqual([]);
  });

  it.each([
    ['username', 'a'.repeat(USERNAME_MIN_LENGTH - 1)],
    ['username', 'a'.repeat(USERNAME_MAZ_LENGTH + 1)],
    ['firstName', 'A'.repeat(PERSONAL_INFO_FIRST_NAME_MAX_LENGTH + 1)],
    ['lastName', 'D'.repeat(PERSONAL_INFO_LAST_NAME_MAX_LENGTH + 1)],
  ])('rejects %s outside a configured length boundary', async (property, value) => {
    await expectInvalid({ ...validPayload, [property]: value }, property);
  });

  it.each(['user name', 'user.name', 'username!', 'имяuser'])('rejects username %j', async (username) => {
    await expectInvalid({ ...validPayload, username }, 'username');
  });

  it.each([
    ['firstName', 'John123'],
    ['firstName', 'John?'],
    ['lastName', '@Doe'],
    ['lastName', 'Doe!'],
  ])('rejects %s when it violates the name pattern', async (property, value) => {
    await expectInvalid({ ...validPayload, [property]: value }, property);
  });

  it.each(['dateOfBirth', 'aboutMe', 'countryCode', 'city'])(
    'accepts an omitted, undefined, or null optional %s',
    async (property) => {
      const omittedDto = plainToInstance(UpdateProfileInfoDto, validPayload);
      const undefinedDto = plainToInstance(UpdateProfileInfoDto, { ...validPayload, [property]: undefined });
      const nullDto = plainToInstance(UpdateProfileInfoDto, { ...validPayload, [property]: null });
      await expect(validate(omittedDto)).resolves.toEqual([]);
      await expect(validate(undefinedDto)).resolves.toEqual([]);
      await expect(validate(nullDto)).resolves.toEqual([]);
    },
  );

  it('accepts an empty aboutMe after trimming', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, { ...validPayload, aboutMe: '   ' });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto.aboutMe).toBe('');
  });

  it.each(['dateOfBirth', 'countryCode', 'city'])(
    'rejects an empty optional %s when it is explicitly supplied',
    async (property) => {
      await expectInvalid({ ...validPayload, [property]: '   ' }, property);
    },
  );

  it.each([
    ['dateOfBirth', 20010111],
    ['aboutMe', 123],
    ['countryCode', 12],
    ['city', false],
  ])('rejects a non-string optional %s', async (property, value) => {
    await expectInvalid({ ...validPayload, [property]: value }, property);
  });

  it.each(['12.12.2012', '2012-1-01', '2012-01-1', '2012/01/01', '2012-01-01T00:00:00Z'])(
    'rejects dateOfBirth with invalid format %j',
    async (dateOfBirth) => {
      await expectInvalid({ ...validPayload, dateOfBirth }, 'dateOfBirth');
    },
  );

  it('accepts a syntactically valid date at the DTO layer', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, { ...validPayload, dateOfBirth: '2001-12-31' });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it.each(['u', 'UKR', 'U1', '1A', 'УА'])('rejects countryCode %j', async (countryCode) => {
    await expectInvalid({ ...validPayload, countryCode }, 'countryCode');
  });

  it.each(['Kyiv', 'New York', 'Saint-Étienne', 'L’viv', 'Baden-Baden'])('accepts city %j', async (city) => {
    await expect(validate(plainToInstance(UpdateProfileInfoDto, { ...validPayload, city }))).resolves.toEqual(
      [],
    );
  });

  it.each(['Kyiv123', 'Kyiv@', 'a'.repeat(PERSONAL_INFO_CITY_MAX_LENGTH + 1)])(
    'rejects city %j',
    async (city) => {
      await expectInvalid({ ...validPayload, city }, 'city');
    },
  );

  it('accepts city and aboutMe at their maximum length', async () => {
    const dto = plainToInstance(UpdateProfileInfoDto, {
      ...validPayload,
      city: 'a'.repeat(PERSONAL_INFO_CITY_MAX_LENGTH),
      aboutMe: 'a'.repeat(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH),
    });
    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects aboutMe exceeding its maximum length', async () => {
    await expectInvalid(
      { ...validPayload, aboutMe: 'a'.repeat(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH + 1) },
      'aboutMe',
    );
  });
});
