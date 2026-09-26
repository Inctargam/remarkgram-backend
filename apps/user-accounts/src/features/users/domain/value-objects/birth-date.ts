import { BIRTH_DATE_MIN_ALLOWED_AGE, BIRTH_DATE_REGEX } from '@app/user-accounts-grpc';
import {
  BirthDateMinAllowedAgeError,
  InvalidBirthDateFormatError,
  NonExistentCalendarDateError,
} from '../../application/errors/birth-date.errors.js';

export class BirthDate {
  public readonly value: Date;

  protected constructor(value: Date) {
    this.value = value;
  }
  public static create(dateStr: string): BirthDate {
    dateStr = dateStr.trim();

    BirthDate.assertMismatchFormat(dateStr);

    const [, yearStr, monthStr, dayStr] = dateStr.match(BIRTH_DATE_REGEX)!;
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    const day = parseInt(dayStr, 10);
    const parsedDate = new Date(Date.UTC(year, month, day));
    if (
      parsedDate.getUTCFullYear() !== year ||
      parsedDate.getUTCMonth() !== month ||
      parsedDate.getUTCDate() !== day
    ) {
      throw new NonExistentCalendarDateError();
    }

    const now = new Date();

    BirthDate.assertMinAllowedAge(parsedDate, now);

    return new BirthDate(parsedDate);
  }

  private static assertMinAllowedAge(birthDate: Date, now: Date) {
    const year = birthDate.getUTCFullYear();
    let age = now.getUTCFullYear() - year;
    const nowMonth = now.getUTCMonth();
    const birthMonth = birthDate.getUTCMonth();
    const nowDay = now.getUTCDate();
    const birthDay = birthDate.getUTCDate();

    const hasBirthdayPassed = nowMonth > birthMonth || (nowMonth >= birthMonth && nowDay >= birthDay);

    if (!hasBirthdayPassed) {
      age--;
    }

    if (age < BIRTH_DATE_MIN_ALLOWED_AGE) {
      throw new BirthDateMinAllowedAgeError();
    }
  }

  private static assertMismatchFormat(dateStr: string) {
    if (!BIRTH_DATE_REGEX.test(dateStr)) {
      throw new InvalidBirthDateFormatError();
    }
  }

  public static restore(value: Date): BirthDate {
    if (!(value instanceof Date)) {
      throw new Error('Cannot restore BirthDate: value must be a Date');
    }

    if (Number.isNaN(value.getTime())) {
      throw new Error('Cannot restore BirthDate: value is an invalid Date');
    }

    return new BirthDate(new Date(value.getTime()));
  }
}
