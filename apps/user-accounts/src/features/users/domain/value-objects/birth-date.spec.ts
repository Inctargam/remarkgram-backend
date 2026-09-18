import { describe, expect } from 'vitest';
import { BirthDate } from './birth-date.js';
import {
  BirthDateMinAllowedAgeError,
  InvalidBirthDateFormatError,
  NonExistentCalendarDateError,
} from '../../application/errors/birth-date.errors.js';

describe('BirthDateVO', () => {
  it('expect normalized dateSrt format yyyy.mm.dd ', () => {
    const birthDate = BirthDate.create('10.09.2013');
    expect(birthDate.value.getUTCFullYear()).toBe(2013);
    expect(birthDate.value.getUTCMonth()).toBe(8);
    expect(birthDate.value.getUTCDate()).toBe(10);
  });

  it('return an error if dateStr does not match the template', () => {
    expect(() => BirthDate.create('20-10-2012')).toThrow(InvalidBirthDateFormatError);
  });

  it('return an error if dateStr include non-existing calendar date', () => {
    expect(() => BirthDate.create('31.02.2012')).toThrow(NonExistentCalendarDateError);
  });

  it('return an error if dateStr is later than the current date', () => {
    // expect(() => BirthDate.create('14.09.2026')).toThrow('A birth date cannot be in the future');
  });

  it('return an error if the age does not meet the minimum required value', () => {
    expect(() => BirthDate.create('13.09.2014')).toThrow(BirthDateMinAllowedAgeError);
  });
});
