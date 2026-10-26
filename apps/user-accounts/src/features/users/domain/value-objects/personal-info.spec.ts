import { beforeEach, describe, expect, vi } from 'vitest';
import { type CreatePersonalInfoProps, PersonalInfo } from './personal-info.js';
import { BirthDate } from './birth-date.js';
import {
  PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
  PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
  PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
} from '@app/user-accounts-grpc';
import {
  InvalidPersonalInfoAboutMeError,
  InvalidPersonalInfoFirstNameError,
  InvalidPersonalInfoLastNameError,
} from '../../application/errors/personal-info.errors.js';
import { InvalidCityError, InvalidCountryCodeError } from '../../application/errors/location-info.errors.js';

describe('PersonalInfoVO', () => {
  const birthDateSpy = vi.spyOn(BirthDate, 'create');

  const personalInfo = {
    firstName: 'Ivan',
    lastName: 'Ivanov',
    aboutMe: 'aboutMe',
    dateOfBirth: '1980-02-01',
    countryCode: null,
    city: null,
  } satisfies CreatePersonalInfoProps;
  beforeEach(() => {
    birthDateSpy.mockReset();
  });

  it('should be created  with required fields only', () => {
    const personalInfo: PersonalInfo = PersonalInfo.create({
      firstName: 'Ivan',
      lastName: 'Ivanov',
      dateOfBirth: null,
      aboutMe: null,
      countryCode: null,
      city: null,
    });

    expect(personalInfo).toEqual({
      firstName: 'Ivan',
      lastName: 'Ivanov',
      aboutMe: null,
      dateOfBirth: null,
      countryCode: null,
      city: null,
    });
  });

  it.each([
    ['José', 'O’Connor'],
    ['Іван', 'Петренко'],
    ['Anne-Marie', 'van der Waals'],
    ['李', '王'],
  ])('accepts international personal names: %s %s', (firstName, lastName) => {
    const result = PersonalInfo.create({
      ...personalInfo,
      firstName,
      lastName,
    });

    expect(result.firstName).toBe(firstName);
    expect(result.lastName).toBe(lastName);
  });

  it('trims and normalizes names to NFC', () => {
    const result = PersonalInfo.create({
      ...personalInfo,
      firstName: ' Jose\u0301 ',
      lastName: ' Ivanov ',
    });

    expect(result.firstName).toBe('José');
    expect(result.lastName).toBe('Ivanov');
  });

  it('trims aboutMe and converts empty optional strings to null', () => {
    const result = PersonalInfo.create({
      ...personalInfo,
      aboutMe: '   ',
      dateOfBirth: '   ',
      countryCode: '   ',
      city: '   ',
    });

    expect(result.aboutMe).toBeNull();
    expect(result.dateOfBirth).toBeNull();
    expect(result.countryCode).toBeNull();
    expect(result.city).toBeNull();
  });

  it('accepts names and aboutMe at configured length boundaries', () => {
    const result = PersonalInfo.create({
      ...personalInfo,
      firstName: 'A'.repeat(PERSONAL_INFO_FIRST_NAME_MAX_LENGTH),
      lastName: 'B'.repeat(PERSONAL_INFO_LAST_NAME_MAX_LENGTH),
      aboutMe: 'c'.repeat(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH),
    });

    expect(result.firstName).toHaveLength(PERSONAL_INFO_FIRST_NAME_MAX_LENGTH);
    expect(result.lastName).toHaveLength(PERSONAL_INFO_LAST_NAME_MAX_LENGTH);
    expect(result.aboutMe).toHaveLength(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH);
  });

  it.each([
    ['Ivan123', 'Ivanov', InvalidPersonalInfoFirstNameError],
    ['Ivan?', 'Ivanov', InvalidPersonalInfoFirstNameError],
    ['Ivan  John', 'Ivanov', InvalidPersonalInfoFirstNameError],
    ['Ivan', 'Ivanov123', InvalidPersonalInfoLastNameError],
    ['Ivan', '@Ivanov', InvalidPersonalInfoLastNameError],
    ['Ivan', 'Ivanov!', InvalidPersonalInfoLastNameError],
  ])('rejects a name that violates the shared pattern', (firstName, lastName, error) => {
    expect(() =>
      PersonalInfo.create({
        ...personalInfo,
        firstName,
        lastName,
      }),
    ).toThrow(error);
  });

  it('should be created  with required and optional fields', () => {
    const data = {
      firstName: 'Ivan',
      lastName: 'Ivanov',
      aboutMe: 'lorem Ipsum',
      dateOfBirth: '1975-05-15',
      countryCode: null,
      city: null,
    };
    const personalInfo: PersonalInfo = PersonalInfo.create(data);

    expect(birthDateSpy).toHaveBeenCalledOnce();
    expect(birthDateSpy).toHaveBeenCalledWith('1975-05-15');
    expect(personalInfo).toEqual({
      firstName: 'Ivan',
      lastName: 'Ivanov',
      aboutMe: 'lorem Ipsum',
      dateOfBirth: BirthDate.restore(new Date(Date.UTC(1975, 4, 15))),
      countryCode: null,
      city: null,
    });
  });

  it.each([
    [
      { ...personalInfo, firstName: new Array(PERSONAL_INFO_FIRST_NAME_MIN_LENGTH - 1).fill('a').join('') },
      InvalidPersonalInfoFirstNameError,
    ],
    [
      { ...personalInfo, firstName: new Array(PERSONAL_INFO_FIRST_NAME_MAX_LENGTH + 1).fill('a').join('') },
      InvalidPersonalInfoFirstNameError,
    ],
  ])('returns an error if field the firstName violates the constraints [min, max] ', (props, domainError) => {
    try {
      PersonalInfo.create(props);
    } catch (err) {
      expect(err).toBeInstanceOf(domainError);
    }
  });

  it.each([
    [
      { ...personalInfo, lastName: new Array(PERSONAL_INFO_LAST_NAME_MIN_LENGTH - 1).fill('a').join('') },
      InvalidPersonalInfoLastNameError,
    ],
    [
      { ...personalInfo, lastName: new Array(PERSONAL_INFO_LAST_NAME_MAX_LENGTH + 1).fill('a').join('') },
      InvalidPersonalInfoLastNameError,
    ],
  ])('returns an error if field the lastName violates the constraints [min, max] ', (props, domainError) => {
    try {
      PersonalInfo.create(props);
    } catch (err) {
      expect(err).toBeInstanceOf(domainError);
    }
  });

  it('return an error if filed aboutMe violates the constraint max length', () => {
    const invalid = new Array(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH + 1).fill('a').join('');
    try {
      PersonalInfo.create({
        ...personalInfo,
        aboutMe: invalid,
        countryCode: null,
        city: null,
      });
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidPersonalInfoAboutMeError);
    }
  });

  it('normalizes country code', () => {
    const personalInfo = PersonalInfo.create({
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: null,
      aboutMe: null,
      city: 'New York',
      countryCode: ' us ',
    });

    expect(personalInfo.countryCode!.value).toBe('US');
  });

  it('rejects invalid country code', () => {
    expect(() =>
      PersonalInfo.create({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: null,
        aboutMe: null,
        city: 'New York',
        countryCode: 'Ukraine',
      }),
    ).toThrow();
  });

  describe('restore', () => {
    it('restores all persisted fields through nested value objects', () => {
      const dateOfBirth = new Date(Date.UTC(1990, 0, 2));

      const result = PersonalInfo.restore({
        firstName: 'John',
        lastName: 'Doe',
        aboutMe: 'About me',
        dateOfBirth,
        countryCode: 'UA',
        city: 'Kyiv',
      });

      expect(result).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        aboutMe: 'About me',
        dateOfBirth: BirthDate.restore(dateOfBirth),
        countryCode: result.countryCode,
        city: result.city,
      });
      expect(result.countryCode?.value).toBe('UA');
      expect(result.city?.value).toBe('Kyiv');
    });

    it('restores nullable persisted fields', () => {
      expect(
        PersonalInfo.restore({
          firstName: 'John',
          lastName: 'Doe',
          aboutMe: null,
          dateOfBirth: null,
          countryCode: null,
          city: null,
        }),
      ).toEqual({
        firstName: 'John',
        lastName: 'Doe',
        aboutMe: null,
        dateOfBirth: null,
        countryCode: null,
        city: null,
      });
    });

    it.each([
      [{ firstName: '' }, InvalidPersonalInfoFirstNameError],
      [{ lastName: 'Doe123' }, InvalidPersonalInfoLastNameError],
      [{ aboutMe: 'a'.repeat(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH + 1) }, InvalidPersonalInfoAboutMeError],
      [{ countryCode: 'ua' }, InvalidCountryCodeError],
      [{ city: 'Kyiv123' }, InvalidCityError],
    ])('rejects invalid persisted nested data %#', (override, error) => {
      expect(() =>
        PersonalInfo.restore({
          firstName: 'John',
          lastName: 'Doe',
          aboutMe: null,
          dateOfBirth: null,
          countryCode: null,
          city: null,
          ...override,
        }),
      ).toThrow(error);
    });
  });
});
