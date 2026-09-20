import { describe, expect } from 'vitest';
import { BirthDate } from './birth-date.js';
import {
  BirthDateMinAllowedAgeError,
  InvalidBirthDateFormatError,
  NonExistentCalendarDateError,
} from '../../application/errors/birth-date.errors.js';

describe('BirthDateVO', () => {
  it('expect normalized dateSrt format yyyy.mm.dd ', () => {
    const birthDate = BirthDate.create('2013-09-10');
    expect(birthDate.value.getUTCFullYear()).toBe(2013);
    expect(birthDate.value.getUTCMonth()).toBe(8);
    expect(birthDate.value.getUTCDate()).toBe(10);
  });

  it('return an error if dateStr does not match the template', () => {
    expect(() => BirthDate.create('20.10.2012')).toThrow(InvalidBirthDateFormatError);
  });

  it('return an error if dateStr include non-existing calendar date', () => {
    expect(() => BirthDate.create('2012-02-31')).toThrow(NonExistentCalendarDateError);
  });

  it('return an error if dateStr is later than the current date', () => {
    // expect(() => BirthDate.create('2026-09-14')).toThrow('A birth date cannot be in the future');
  });

  it('return an error if the age does not meet the minimum required value', () => {
    expect(() => BirthDate.create('2014-09-13')).toThrow(BirthDateMinAllowedAgeError);
  });
});
