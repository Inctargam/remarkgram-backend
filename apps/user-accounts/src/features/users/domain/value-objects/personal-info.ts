import {
  PERSONAL_INFO_ABOUT_ME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
  PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
  PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
  PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
  PERSONAL_INFO_NAME_PATTERN,
} from '@app/user-accounts-grpc';
import { BirthDate } from './birth-date.js';
import {
  InvalidPersonalInfoAboutMeError,
  InvalidPersonalInfoFirstNameError,
  InvalidPersonalInfoLastNameError,
} from '../../application/errors/personal-info.errors.js';
import { City } from './city.js';
import { CountryCode } from './country-code.js';

export type CreatePersonalInfoProps = {
  firstName: string;
  lastName: string;
  dateOfBirth: string | null;
  aboutMe: string | null;
  countryCode: string | null;
  city: string | null;
};
type RestorePersonalInfoProps = {
  firstName: string;
  lastName: string;
  dateOfBirth: Date | null;
  aboutMe: string | null;
  countryCode: string | null;
  city: string | null;
};
export class PersonalInfo {
  public readonly firstName: string;
  public readonly lastName: string;
  public readonly aboutMe: string | null = null;
  public readonly dateOfBirth: BirthDate | null;
  public readonly countryCode: CountryCode | null;
  public readonly city: City | null;

  private constructor(props: {
    firstName: string;
    lastName: string;
    aboutMe: string | null;
    dateOfBirth: BirthDate | null;
    countryCode: CountryCode | null;
    city: City | null;
  }) {
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.dateOfBirth = props.dateOfBirth;
    this.aboutMe = props.aboutMe;
    this.countryCode = props.countryCode;
    this.city = props.city;
    Object.freeze(this); // запрещаем модификацию объекта на уровне runtime
  }
  public static create(props: CreatePersonalInfoProps): PersonalInfo {
    const firstName = props.firstName.trim().normalize('NFC');
    const lastName = props.lastName.trim().normalize('NFC');
    const aboutMe = props.aboutMe?.trim() || null;

    PersonalInfo.assertFirstName(firstName);
    PersonalInfo.assertLastName(lastName);

    PersonalInfo.assertAboutMe(aboutMe);

    const dateOfBirth =
      props.dateOfBirth == null || props.dateOfBirth.trim() === ''
        ? null
        : BirthDate.create(props.dateOfBirth);

    const city = props.city == null || props.city.trim() === '' ? null : City.create(props.city);

    const countryCode =
      props.countryCode == null || props.countryCode.trim() === ''
        ? null
        : CountryCode.create(props.countryCode);

    return new PersonalInfo({
      firstName,
      lastName: lastName,
      aboutMe: aboutMe ?? null,
      dateOfBirth: dateOfBirth,
      city: city,
      countryCode: countryCode,
    });
  }

  private static assertFirstName(value: string): void {
    if (
      value.length < PERSONAL_INFO_FIRST_NAME_MIN_LENGTH ||
      value.length > PERSONAL_INFO_FIRST_NAME_MAX_LENGTH ||
      !PERSONAL_INFO_NAME_PATTERN.test(value)
    ) {
      throw new InvalidPersonalInfoFirstNameError(
        PERSONAL_INFO_FIRST_NAME_MIN_LENGTH,
        PERSONAL_INFO_FIRST_NAME_MAX_LENGTH,
      );
    }
  }
  private static assertLastName(value: string): void {
    if (
      value.length < PERSONAL_INFO_LAST_NAME_MIN_LENGTH ||
      value.length > PERSONAL_INFO_LAST_NAME_MAX_LENGTH ||
      !PERSONAL_INFO_NAME_PATTERN.test(value)
    ) {
      throw new InvalidPersonalInfoLastNameError(
        PERSONAL_INFO_LAST_NAME_MIN_LENGTH,
        PERSONAL_INFO_LAST_NAME_MAX_LENGTH,
      );
    }
  }
  private static assertAboutMe(value: string | null): void {
    if (typeof value === 'string' && value.length > PERSONAL_INFO_ABOUT_ME_MAX_LENGTH) {
      throw new InvalidPersonalInfoAboutMeError(PERSONAL_INFO_ABOUT_ME_MAX_LENGTH);
    }
  }
  public static restore(props: RestorePersonalInfoProps): PersonalInfo {
    PersonalInfo.assertFirstName(props.firstName);
    PersonalInfo.assertLastName(props.lastName);
    PersonalInfo.assertAboutMe(props.aboutMe);
    return new PersonalInfo({
      firstName: props.firstName,
      lastName: props.lastName,
      aboutMe: props.aboutMe,

      dateOfBirth: props.dateOfBirth === null ? null : BirthDate.restore(props.dateOfBirth),

      city: props.city === null ? null : City.restore(props.city),

      countryCode: props.countryCode === null ? null : CountryCode.restore(props.countryCode),
    });
  }
}
